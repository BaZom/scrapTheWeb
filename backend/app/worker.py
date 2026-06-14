import asyncio
import hashlib
import json
import re
import time
from collections.abc import Callable
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID

import structlog
from playwright.async_api import async_playwright
from sqlalchemy import select

from app.arq_utils import redis_settings_from_url
from app.change_detector import persist_change_events_for_run
from app.config import get_settings
from app.models import ExtractedRecord, ExtractionRun, PageSession, Recipe, RecipeVersion
from app.observability import (
    WORKER_JOB_DURATION_SECONDS,
    WORKER_JOB_TOTAL,
    configure_logging,
    configure_sentry,
    configure_worker_tracing,
    flush_sentry,
    get_tracer,
    start_worker_metrics_server,
)
from app.overlay_reduction import reduce_blocking_overlays
from app.resources import ensure_bucket, make_engine, make_redis, make_s3_client, make_sessionmaker
from app.run_health import assess_run_health, drift_message

logger = structlog.get_logger(__name__)

# Conservative ad/analytics/tracker domains aborted during render (when RENDER_BLOCK_ADS).
# Deliberately excludes consent CMPs (handled by overlay_reduction) and content CDNs.
# Matched against the full request URL via one native regex route, so non-matching
# requests never round-trip to Python.
_AD_DOMAINS = (
    "doubleclick.net", "googlesyndication.com", "googletagmanager.com",
    "google-analytics.com", "googleadservices.com", "adservice.google",
    "amazon-adsystem.com", "adnxs.com", "criteo.com", "criteo.net", "taboola.com",
    "outbrain.com", "rubiconproject.com", "pubmatic.com", "openx.net",
    "casalemedia.com", "smartadserver.com", "adform.net", "moatads.com",
    "doubleverify.com", "adsafeprotected.com", "scorecardresearch.com",
    "quantserve.com", "hotjar.com", "mixpanel.com", "fullstory.com", "segment.io",
    "clarity.ms", "bat.bing.com", "mc.yandex.ru", "teads.tv", "33across.com",
)
_AD_URL_RE = re.compile("|".join(re.escape(domain) for domain in _AD_DOMAINS), re.IGNORECASE)


async def _block_ad_route(route: Any) -> None:
    try:
        await route.abort()
    except Exception:
        try:
            await route.continue_()
        except Exception:
            pass


HEARTBEAT_PATH = Path("/tmp/skrowt-worker-alive")
# Headroom so a one-item page keeps the whole item (main fields + details), not just the
# first screenful of elements. Overlays are hover-only, so more nodes add no UI clutter.
MAX_DOM_NODES = 900

# Distinguishes a populated page whose selectors broke ("drift") from a blank/error shell
# the fetch failed to deliver ("empty"). Both quarantine when they collapse a baseline to
# zero; this only decides which honest reason the user sees (see run_health.assess_run_health).
_MIN_RENDER_CONTENT_BYTES = 200

# Browser-side render scripts live as standalone .js files under render_scripts/ so
# they are not subject to Python line-length and are easy to edit/lint as JS.
_RENDER_SCRIPTS_DIR = Path(__file__).parent / "render_scripts"


@lru_cache(maxsize=1)
def _render_script(name: str) -> str:
    return (_RENDER_SCRIPTS_DIR / name).read_text(encoding="utf-8")


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    configure_logging(settings.log_level, service=settings.otel_service_name_worker)
    configure_sentry(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        service=settings.otel_service_name_worker,
        traces_sample_rate=settings.sentry_traces_sample_rate,
    )
    configure_worker_tracing(
        service=settings.otel_service_name_worker,
        otlp_endpoint=settings.otel_exporter_otlp_endpoint,
        console=settings.otel_console_exporter,
    )
    start_worker_metrics_server(settings.worker_metrics_port)
    ctx["settings"] = settings
    ctx["logger"] = structlog.get_logger(__name__)
    ctx["tracer"] = get_tracer("app.worker")
    ctx["engine"] = make_engine(settings)
    ctx["sessionmaker"] = make_sessionmaker(ctx["engine"])
    ctx["redis"] = make_redis(settings)
    ctx["s3"] = make_s3_client(settings)
    await ensure_bucket(settings)
    _write_heartbeat()
    ctx["logger"].info("worker_started")


async def shutdown(ctx: dict[str, Any]) -> None:
    logger = ctx.get("logger") or structlog.get_logger(__name__)
    redis_client = ctx.get("redis")
    if redis_client is not None:
        try:
            await redis_client.aclose()
        except Exception:
            logger.exception("worker_redis_close_failed")
    engine = ctx.get("engine")
    if engine is not None:
        try:
            await engine.dispose()
        except Exception:
            logger.exception("worker_engine_dispose_failed")
    flush_sentry()
    logger.info("worker_stopped")


async def render_page(
    ctx: dict[str, Any],
    session_id: str,
    url: str,
    organization_id: str,
    user_id: str,
) -> dict[str, Any]:
    arq_job_id = ctx.get("job_id", session_id)
    logger = ctx["logger"].bind(
        job_id=arq_job_id,
        page_session_id=session_id,
        kind="render_page",
        org_id=organization_id,
        user_id=user_id,
    )
    started_at = time.monotonic()
    _write_heartbeat()
    await _update_page_session(ctx, session_id, status="running")
    logger.info("worker_job_started")
    try:
        rendered = await _render_with_playwright(
            url,
            ctx["settings"].render_navigation_timeout_ms,
        )
        screenshot_key = f"page-sessions/{organization_id}/{session_id}/screenshot.png"
        html_key = f"page-sessions/{organization_id}/{session_id}/page.html"

        await asyncio.gather(
            _to_thread(
                ctx["s3"].put_object,
                Bucket=ctx["settings"].s3_bucket,
                Key=screenshot_key,
                Body=rendered["screenshot"],
                ContentType="image/png",
            ),
            _to_thread(
                ctx["s3"].put_object,
                Bucket=ctx["settings"].s3_bucket,
                Key=html_key,
                Body=rendered["html"].encode("utf-8"),
                ContentType="text/html; charset=utf-8",
            ),
        )

        payload = {
            "sessionId": session_id,
            "status": "completed",
            "metadata": {
                "title": rendered["title"],
                "url": url,
                "screenshotKey": screenshot_key,
                "htmlKey": html_key,
                "overlayDismissals": rendered["overlay_dismissals"],
                "accessBlock": rendered["access_block"],
            },
            "domNodes": rendered["dom_nodes"],
            "containerCandidates": rendered["container_candidates"],
        }
        await ctx["redis"].set(
            f"page_session:{session_id}",
            json.dumps(payload),
            ex=ctx["settings"].page_session_ttl_seconds,
        )
        await _update_page_session(
            ctx,
            session_id,
            status="completed",
            screenshot_key=screenshot_key,
            html_key=html_key,
        )
        duration_seconds = (time.monotonic() - started_at)
        WORKER_JOB_TOTAL.labels(kind="render_page", outcome="completed").inc()
        WORKER_JOB_DURATION_SECONDS.labels(
            kind="render_page", outcome="completed"
        ).observe(duration_seconds)
        logger.info(
            "worker_job_completed",
            status="completed",
            duration_ms=int(duration_seconds * 1000),
        )
        return payload
    except Exception as exc:
        duration_seconds = (time.monotonic() - started_at)
        await _update_page_session(ctx, session_id, status="failed", error_message=str(exc)[:1024])
        WORKER_JOB_TOTAL.labels(kind="render_page", outcome="failed").inc()
        WORKER_JOB_DURATION_SECONDS.labels(
            kind="render_page", outcome="failed"
        ).observe(duration_seconds)
        logger.exception(
            "worker_job_failed",
            status="failed",
            duration_ms=int(duration_seconds * 1000),
        )
        raise
    finally:
        _write_heartbeat()


async def run_recipe(
    ctx: dict[str, Any],
    run_id: str,
    recipe_id: str,
    organization_id: str,
) -> dict[str, Any]:
    arq_job_id = ctx.get("job_id", run_id)
    logger = ctx["logger"].bind(
        job_id=arq_job_id,
        run_id=run_id,
        recipe_id=recipe_id,
        kind="run_recipe",
        org_id=organization_id,
    )
    started_at = time.monotonic()
    _write_heartbeat()
    await _update_extraction_run(ctx, run_id, status="running", started_at=datetime.now(UTC))
    logger.info("worker_job_started")
    try:
        recipe, version = await _load_recipe_version(ctx, recipe_id, organization_id)
        config = version.config
        url = str(config.get("urlPattern") or recipe.url_pattern)
        container_selector = str(config["containerSelector"])
        page_type = str(config.get("pageType") or recipe.page_type or "listing")
        is_single = page_type == "single" or container_selector == "body"
        rendered = await _render_with_playwright(
            url,
            ctx["settings"].render_navigation_timeout_ms,
            # Single-page sprouts scope to the whole page (synthetic "body"), so there's no
            # listing container worth waiting for.
            wait_for_selector=None if is_single else container_selector,
            # Extract in the browser with the same engine the builder used (see extract_rows.js).
            extract_spec={
                "containerSelector": container_selector,
                "fields": list(config["fields"]),
                "pageType": page_type,
                "limit": None,
            },
        )
        rows = rendered["rows"] or []
        await _persist_extracted_records(ctx, run_id, recipe_id, organization_id, rows, config)

        # Before diffing, decide whether this run is trustworthy. A broken selector or an
        # anti-bot block both extract 0 rows; diffing that against a populated baseline would
        # persist a false "everything removed". Quarantine instead — keep the records (so the
        # run is inspectable) but write no change events, and mark needs_attention so this run
        # cannot become the baseline for the next one. See app/run_health.py + ADR 0014.
        baseline_count = await _previous_completed_record_count(
            ctx, run_id, recipe_id, organization_id
        )
        health = assess_run_health(
            current_count=len(rows),
            baseline_count=baseline_count,
            access_blocked=bool(rendered.get("access_block")),
            page_had_content=len(rendered["html"].strip()) > _MIN_RENDER_CONTENT_BYTES,
        )
        if health != "ok":
            await _update_extraction_run(
                ctx,
                run_id,
                status="needs_attention",
                total_records=len(rows),
                error_message=drift_message(health),
                finished_at=datetime.now(UTC),
            )
            duration_seconds = time.monotonic() - started_at
            WORKER_JOB_TOTAL.labels(kind="run_recipe", outcome="needs_attention").inc()
            WORKER_JOB_DURATION_SECONDS.labels(
                kind="run_recipe", outcome="needs_attention"
            ).observe(duration_seconds)
            logger.warning(
                "worker_job_needs_attention",
                status="needs_attention",
                health=health,
                total_records=len(rows),
                baseline_records=baseline_count,
                duration_ms=int(duration_seconds * 1000),
            )
            return {
                "runId": run_id,
                "status": "needs_attention",
                "health": health,
                "totalRecords": len(rows),
                "changeEvents": 0,
            }

        change_count = await _persist_change_events(ctx, run_id)
        await _update_extraction_run(
            ctx,
            run_id,
            status="completed",
            total_records=len(rows),
            finished_at=datetime.now(UTC),
        )
        duration_seconds = (time.monotonic() - started_at)
        WORKER_JOB_TOTAL.labels(kind="run_recipe", outcome="completed").inc()
        WORKER_JOB_DURATION_SECONDS.labels(
            kind="run_recipe", outcome="completed"
        ).observe(duration_seconds)
        logger.info(
            "worker_job_completed",
            status="completed",
            total_records=len(rows),
            change_events=change_count,
            duration_ms=int(duration_seconds * 1000),
        )
        return {
            "runId": run_id,
            "status": "completed",
            "totalRecords": len(rows),
            "changeEvents": change_count,
        }
    except Exception as exc:
        duration_seconds = (time.monotonic() - started_at)
        await _update_extraction_run(
            ctx,
            run_id,
            status="failed",
            error_message=str(exc)[:1024],
            finished_at=datetime.now(UTC),
        )
        WORKER_JOB_TOTAL.labels(kind="run_recipe", outcome="failed").inc()
        WORKER_JOB_DURATION_SECONDS.labels(
            kind="run_recipe", outcome="failed"
        ).observe(duration_seconds)
        logger.exception(
            "worker_job_failed",
            status="failed",
            duration_ms=int(duration_seconds * 1000),
        )
        raise
    finally:
        _write_heartbeat()


# Anti-bot vendor signatures (server header / cookie / body markers) used only to label
# a detected block; detection itself is driven by the HTTP status to avoid false positives.
_BLOCK_VENDORS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("Akamai", ("akamaighost", "akamai", "_abck", "reference #")),
    ("Cloudflare", ("cloudflare", "cf-ray", "cf-mitigated", "attention required")),
    ("DataDome", ("datadome", "x-datadome")),
    ("Imperva", ("incapsula", "incap_ses", "_incap", "imperva")),
    ("PerimeterX", ("perimeterx", "px-captcha", "_pxhd")),
)
_BLOCK_PHRASES: tuple[str, ...] = (
    "access denied",
    "zugriff verweigert",
    "attention required",
    "verify you are human",
    "are you a robot",
    "request blocked",
    "you have been blocked",
    "unusual traffic",
)


def _detect_access_block(
    status: int,
    headers: dict[str, str],
    title: str | None,
    body_text: str | None,
) -> dict[str, Any] | None:
    """Conservatively flag an anti-bot block so the UI can explain it.

    Driven by HTTP status (401/403/429, or 503 with a vendor/phrase signal) to avoid
    false positives on normal pages that merely contain words like "access denied".
    Returns None when the page looks normal.
    """
    haystack = " ".join(
        [
            (headers.get("server") or "").lower(),
            (title or "").lower(),
            (body_text or "")[:2000].lower(),
            " ".join(f"{key}:{value}" for key, value in headers.items()).lower(),
        ]
    )
    vendor = next(
        (name for name, markers in _BLOCK_VENDORS if any(m in haystack for m in markers)),
        None,
    )
    phrase_hit = any(phrase in haystack for phrase in _BLOCK_PHRASES)

    blocked = status in (401, 403, 429) or (status == 503 and (vendor or phrase_hit))
    if not blocked:
        return None

    reason = (
        f"{vendor + ' ' if vendor else ''}bot protection denied access "
        f"(HTTP {status}). This site blocks automated browsers."
    )
    return {
        "blocked": True,
        "status": int(status),
        "vendor": vendor or "unknown",
        "reason": reason,
    }


async def _wait_for_dom_stable(
    page: Any,
    *,
    timeout_ms: int = 4000,
    quiet_ms: int = 600,
    poll_ms: int = 150,
) -> int:
    """Wait until the live element count stops changing for ``quiet_ms`` (capped at ``timeout_ms``).

    Dismissing a consent CMP can tear the page down and rebuild it: sites like kleinanzeigen
    collapse to a ~40-element shell on "reject all", then re-hydrate the listings over ~1-2s.
    networkidle is unreliable here (ad/tracking-heavy SPAs never reach it), so we poll the
    element count instead. The ``count > 100`` guard avoids latching onto the collapsed shell.
    Returns the last observed element count.

    A failing ``evaluate`` means the execution context was just destroyed — i.e. the page is
    navigating/rebuilding *right now*, which is exactly what we're here to wait through. So we
    treat it as "not stable yet" (reset the streak and keep polling) rather than giving up;
    bailing here would snapshot the half-built shell on slower re-hydrations.
    """
    deadline = time.monotonic() + timeout_ms / 1000
    last_count = -1
    stable_since: float | None = None
    while time.monotonic() < deadline:
        try:
            count = int(await page.evaluate("() => document.querySelectorAll('*').length"))
        except Exception:
            # Context torn down mid-rebuild: the DOM is in flux, so reset the streak.
            count, stable_since, last_count = -1, None, -1
        if count == last_count and count > 100:
            if stable_since is None:
                stable_since = time.monotonic()
            elif (time.monotonic() - stable_since) * 1000 >= quiet_ms:
                return count
        else:
            stable_since = None
            last_count = count
        try:
            await page.wait_for_timeout(poll_ms)
        except Exception:
            await asyncio.sleep(poll_ms / 1000)
    return last_count


async def _autoscroll(
    page: Any,
    *,
    max_scrolls: int = 12,
    step_px: int = 1400,
    settle_ms: int = 350,
) -> None:
    """Scroll to the bottom in steps to trigger lazy-loaded content, then reset to the top.

    Listing pages routinely defer below-fold cards and images (``data-src``) until they scroll
    into view. ``page.content()`` is captured without scrolling, so that content is missing from
    *both* the build freeze and the run extraction — the user can pick it from the full-page
    screenshot, but the saved run never sees it. Walk down the page, pausing briefly so lazy
    loaders fire, until we reach the bottom and the scroll height stops growing, or we hit the
    step cap (bounded so a tall/infinite-scroll page can't exhaust the job timeout). Reset to the
    top afterwards so the full-page screenshot and element geometry stay top-anchored (matching
    the rest of the capture). Best-effort: a scroll/evaluate hiccup must never fail the render.
    """
    try:
        for _ in range(max_scrolls):
            before = int(await page.evaluate("() => document.documentElement.scrollHeight"))
            await page.evaluate("(y) => window.scrollBy(0, y)", step_px)
            await page.wait_for_timeout(settle_ms)
            after = int(await page.evaluate("() => document.documentElement.scrollHeight"))
            at_bottom = bool(
                await page.evaluate(
                    "() => window.innerHeight + window.scrollY"
                    " >= document.documentElement.scrollHeight - 2"
                )
            )
            if at_bottom and after <= before:
                break
    except Exception:
        logger.debug("autoscroll_incomplete", exc_info=True)
    finally:
        # Always return to the top, even if scrolling failed partway: dom_candidates.js records
        # viewport-relative getBoundingClientRect() coordinates, so a page left scrolled would
        # corrupt the builder overlay geometry. Best-effort — cleanup must never raise either.
        try:
            await page.evaluate("() => window.scrollTo(0, 0)")
            await page.wait_for_timeout(150)
        except Exception:
            logger.debug("autoscroll_reset_incomplete", exc_info=True)


async def _render_with_playwright(
    url: str,
    navigation_timeout_ms: int,
    *,
    wait_for_selector: str | None = None,
    extract_spec: dict[str, Any] | None = None,
) -> dict[str, Any]:
    settings = get_settings()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(
            headless=settings.render_headless,
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            context = await browser.new_context(
                viewport={"width": 1440, "height": 1200},
                user_agent=settings.render_user_agent,
                locale=settings.render_locale,
                timezone_id=settings.render_timezone,
                extra_http_headers={"Accept-Language": settings.render_accept_language},
            )
            if settings.render_stealth:
                await context.add_init_script(_render_script("stealth.js"))
            if settings.render_block_ads:
                await context.route(_AD_URL_RE, _block_ad_route)
            page = await context.new_page()
            page.set_default_navigation_timeout(navigation_timeout_ms)
            # domcontentloaded (not networkidle): ad/tracking-heavy SPAs like autoscout24
            # never go network-idle, so networkidle would time out and fail the whole
            # render. Then give the page a brief, best-effort settle to let listings paint.
            response = await page.goto(
                url, wait_until="domcontentloaded", timeout=navigation_timeout_ms
            )
            try:
                # Brief, best-effort settle for late content. Ad/tracking-heavy SPAs never
                # go network-idle, so this would otherwise burn the full timeout every time
                # — keep it short (the DOM is already present after domcontentloaded).
                await page.wait_for_load_state("networkidle", timeout=1000)
            except Exception:
                pass
            overlay_dismissals = await reduce_blocking_overlays(page)
            # Dismissing a consent CMP can tear the page down and rebuild it (kleinanzeigen
            # collapses to a ~40-element shell on "reject all", then re-hydrates the listings).
            # Capturing page.content() before that rebuild persists the empty shell, so the
            # screenshot/picker (taken later, once re-hydrated) show data but preview/extraction
            # find nothing. Wait for the DOM to re-stabilize before snapshotting.
            if overlay_dismissals:
                await _wait_for_dom_stable(page)
            # Wait for the saved sprout's container to actually exist before snapshotting, so an
            # SPA listing isn't captured half-built (best-effort — the settle above + autoscroll
            # below still apply if it never shows). Only the run passes a selector; the build has
            # none yet.
            if wait_for_selector:
                try:
                    await page.wait_for_selector(wait_for_selector, state="attached", timeout=2000)
                except Exception:
                    pass
            # Trigger lazy-loaded / below-fold content before extracting — RUN ONLY. The builder
            # needs a STATIC, top-anchored snapshot: scrolling reflows lazy images (shifting the
            # screenshot under the overlay boxes) and inflates the node set past the capture
            # budget (dropping an item's field nodes). The run extracts data, not coordinates, so
            # it can scroll freely; the build (no extract_spec) must not.
            if extract_spec is not None:
                await _autoscroll(page)
            title = await page.title()
            html = await page.content()
            screenshot = await page.screenshot(full_page=True, type="png")
            body_text = await page.evaluate(
                "() => (document.body ? document.body.innerText : '').slice(0, 2000)"
            )
            access_block = _detect_access_block(
                response.status if response else 0,
                dict(response.headers) if response else {},
                title,
                body_text,
            )
            # A run (extract_spec given) extracts rows here in the browser, using the same DOM +
            # CSS engine the builder picked against — so the run can't diverge from the build.
            # The builder render (no extract_spec) instead collects the candidate/DOM-node set
            # for picking. They're mutually exclusive: a run doesn't need candidates, a build
            # doesn't extract. Both steps are best-effort and must not discard the captured
            # screenshot/HTML; extract_rows.js itself never throws (bad selector -> empty cell).
            rows: list[dict[str, str]] | None = None
            dom_nodes: list[Any] = []
            container_candidates: list[Any] = []
            if extract_spec is not None:
                try:
                    extracted = await page.evaluate(_render_script("extract_rows.js"), extract_spec)
                    rows = extracted if isinstance(extracted, list) else []
                except Exception:
                    logger.exception("row_extraction_failed")
                    rows = []
            else:
                try:
                    evaluated = await page.evaluate(
                        _render_script("dom_candidates.js"), MAX_DOM_NODES
                    )
                except Exception:
                    logger.exception("dom_candidate_extraction_failed")
                    evaluated = {}
                dom_nodes = evaluated.get("domNodes", []) if isinstance(evaluated, dict) else []
                container_candidates = (
                    evaluated.get("candidates", []) if isinstance(evaluated, dict) else []
                )
            return {
                "title": title,
                "html": html,
                "screenshot": screenshot,
                "dom_nodes": dom_nodes,
                "container_candidates": container_candidates,
                "overlay_dismissals": overlay_dismissals,
                "access_block": access_block,
                "rows": rows,
            }
        finally:
            await browser.close()


async def _update_page_session(
    ctx: dict[str, Any],
    session_id: str,
    *,
    status: str,
    screenshot_key: str | None = None,
    html_key: str | None = None,
    error_message: str | None = None,
) -> None:
    async with ctx["sessionmaker"]() as session:
        page_session = await session.get(PageSession, UUID(session_id))
        if page_session is None:
            return
        page_session.status = status
        if screenshot_key is not None:
            page_session.screenshot_key = screenshot_key
        if html_key is not None:
            page_session.html_key = html_key
        if error_message is not None:
            page_session.error_message = error_message
        await session.commit()


async def _load_recipe_version(
    ctx: dict[str, Any], recipe_id: str, organization_id: str
) -> tuple[Recipe, RecipeVersion]:
    async with ctx["sessionmaker"]() as session:
        recipe = await session.get(Recipe, UUID(recipe_id))
        if recipe is None or str(recipe.organization_id) != organization_id:
            raise ValueError("Recipe not found")
        result = await session.execute(
            select(RecipeVersion)
            .where(
                RecipeVersion.recipe_id == recipe.id,
                RecipeVersion.organization_id == recipe.organization_id,
            )
            .order_by(RecipeVersion.version.desc())
        )
        version = result.scalar_one_or_none()
        if version is None:
            raise ValueError("Recipe has no saved version")
        return recipe, version


async def _persist_extracted_records(
    ctx: dict[str, Any],
    run_id: str,
    recipe_id: str,
    organization_id: str,
    rows: list[dict[str, str]],
    config: dict[str, Any],
) -> None:
    primary_key = None
    deduplication = config.get("deduplication")
    if isinstance(deduplication, dict):
        primary_key = deduplication.get("primaryKey")

    async with ctx["sessionmaker"]() as session:
        for index, row in enumerate(rows):
            key_field = primary_key if isinstance(primary_key, str) else None
            record_key = _record_key(row, key_field, index)
            session.add(
                ExtractedRecord(
                    organization_id=UUID(organization_id),
                    run_id=UUID(run_id),
                    recipe_id=UUID(recipe_id),
                    record_key=record_key,
                    data=row,
                )
            )
        await session.commit()


async def _persist_change_events(ctx: dict[str, Any], run_id: str) -> int:
    async with ctx["sessionmaker"]() as session:
        count = await persist_change_events_for_run(session, UUID(run_id))
        await session.commit()
        return count


async def _previous_completed_record_count(
    ctx: dict[str, Any], run_id: str, recipe_id: str, organization_id: str
) -> int:
    """Record count of the most recent *completed* run — the diff/drift baseline.

    Mirrors the previous-run selection in ``persist_change_events_for_run`` (latest
    completed run, excluding this one) so the baseline matches what the diff compares
    against. Returns 0 when there is no prior completed run (first run can't drift).
    """
    async with ctx["sessionmaker"]() as session:
        result = await session.execute(
            select(ExtractionRun.total_records)
            .where(
                ExtractionRun.recipe_id == UUID(recipe_id),
                ExtractionRun.organization_id == UUID(organization_id),
                ExtractionRun.id != UUID(run_id),
                ExtractionRun.status == "completed",
            )
            .order_by(
                ExtractionRun.finished_at.desc().nullslast(),
                ExtractionRun.started_at.desc().nullslast(),
            )
            .limit(1)
        )
        return result.scalar_one_or_none() or 0


def _record_key(row: dict[str, str], primary_key: str | None, index: int) -> str:
    if primary_key:
        value = row.get(primary_key)
        if value:
            return value[:255]
    payload = json.dumps(row, sort_keys=True, ensure_ascii=False)
    digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
    return f"{index}-{digest}"[:255]


async def _update_extraction_run(
    ctx: dict[str, Any],
    run_id: str,
    *,
    status: str,
    total_records: int | None = None,
    started_at: datetime | None = None,
    finished_at: datetime | None = None,
    error_message: str | None = None,
) -> None:
    async with ctx["sessionmaker"]() as session:
        run = await session.get(ExtractionRun, UUID(run_id))
        if run is None:
            return
        run.status = status
        if total_records is not None:
            run.total_records = total_records
        if started_at is not None:
            run.started_at = started_at
        if finished_at is not None:
            run.finished_at = finished_at
        if error_message is not None:
            run.error_message = error_message
        await session.commit()


async def _to_thread(function: Callable[..., Any], **kwargs: Any) -> Any:
    return await asyncio.to_thread(function, **kwargs)


def _write_heartbeat() -> None:
    HEARTBEAT_PATH.write_text(str(time.time()), encoding="utf-8")


class WorkerSettings:
    functions = [render_page, run_recipe]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings_from_url(get_settings().redis_url)
    max_jobs = 2
    job_timeout = 60
    keep_result = 3600


__all__ = ["WorkerSettings", "render_page", "run_recipe"]

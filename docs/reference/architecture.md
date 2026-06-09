# Architecture — current state (at a glance)

Source-of-truth summary of how the system fits together **today**, focused on the parts the
builder depends on. For the longer narrative + deployment view, see `docs/ARCHITECTURE.md`.

## Components

| Component | Tech | Role |
|-----------|------|------|
| **Frontend** | Next.js (app router), React, Tailwind, Zod | The client workbench: auth, render, builder, preview, runs, diffs, exports. `frontend/`. |
| **API** | FastAPI (Python 3.11) | Tenant auth, page sessions, selectors, preview, recipes, runs, exports, limits, SSRF guards. `backend/app/`. |
| **Worker** | arq + Playwright | Renders pages, captures DOM + screenshot, reduces overlays. `backend/app/worker.py`. |
| **Postgres** | SQLAlchemy (async) | Durable data: users/orgs, `PageSession`, recipes, runs, records, change events. |
| **Redis** | redis-py / arq | Job queue + the per-session `domNodes` payload (TTL). |
| **S3 / MinIO** | boto3 | Durable artifacts: `screenshot.png`, `page.html`. |

```
Browser ──▶ Next.js ──(bearer / X-API-Key)──▶ FastAPI ──┬─▶ Postgres   (recipes, sessions, runs)
                                                         ├─▶ Redis      (job queue, domNodes payload)
                                                         ├─▶ S3/MinIO   (screenshot, page.html)
                                                         └─▶ arq Worker (Playwright render)
```

## The render → extract pipeline

1. **Render** (`worker.py`): Playwright loads the URL (SSRF-validated), blocks ad/tracker
   requests (`RENDER_BLOCK_ADS`), dismisses consent overlays (`overlay_reduction.py`), waits
   for the consent-rebuild DOM to settle (`_wait_for_dom_stable`).
2. **Capture** (`render_scripts/dom_candidates.js`): a flat `domNodes` list (every visible
   element: tag, text ≤160c, selected attrs, classes, parent, geometry) + scored repeating
   "card" candidates. Plus a full-page screenshot.
3. **Persist**: screenshot + `page.html` → **S3**; `domNodes` + candidates → **Redis** (TTL);
   a `PageSession` row → **Postgres**.
4. **Build** (no writes): selector generation, teach-by-example inference, and snapshot
   preview all read `domNodes` from **Redis** and run the in-house matcher
   (`selector_generator.py`).
5. **Save**: the recipe (item selector + fields) → **Postgres**.
6. **Run**: the worker re-fetches the live page, `recipe_runner.py` parses the HTML and
   extracts records, diffs vs the previous run, persists records/changes; CSV/JSON export.

## Where data lives, and when it's written

Nothing is written while building or previewing. Two write moments only: **Render** (S3 +
Redis + a `PageSession` row) and **Save recipe** (Postgres). See
[builder.md §6](builder.md) for detail.

## Two selector matchers (intentional)

- **Snapshot matcher** — `selector_generator.py`, over the flat `domNodes`. Fast, in-memory,
  a bounded CSS subset. Used by build-time generation/inference/**preview**.
- **HTML matcher** — `recipe_runner.py`, over parsed HTML. Authoritative. Used by the saved
  **run** (and the legacy `/preview`).

Both are fed selectors from the same generator, so a generated selector behaves consistently;
the snapshot path trades fidelity (text truncation) for speed at build time.

## Caching

`page_html_cache.py` — a best-effort, per-replica, in-process TTL+LRU cache of `page.html` in
front of S3 (ADR 0008). S3 stays the source of truth; a miss/restart/eviction falls back to
S3. Configurable via `PAGE_HTML_CACHE_*`. (The fast builder preview reads the Redis snapshot,
not HTML, so it doesn't depend on this cache.)

## Cross-cutting

- **Auth/tenancy:** bearer JWT or `X-API-Key`; everything is org-scoped.
- **Limits:** per-user rate limits + per-org monthly quotas (`limits.py`).
- **SSRF:** render URLs validated against private ranges before fetch (`ssrf.py`).
- **Run progress:** SSE (`GET /api/runs/{id}/events`) with a polling fallback.
- **Observability:** see `docs/OBSERVABILITY.md`. **Operating the stack:** `docs/RUNBOOK.md`.

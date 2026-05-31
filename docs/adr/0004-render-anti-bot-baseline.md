# ADR 0004 — Render fingerprint + stealth baseline for anti-bot blocks

- **Status:** Accepted / implemented
- **Date:** 2026-05-31
- **Scope:** `backend/app/worker.py`, `backend/app/config.py`,
  `backend/app/render_scripts/stealth.js`, `.env.example`

## Problem

Some sites (e.g. `suchen.mobile.de`) returned **"Access denied"** — an anti-bot block,
not a cookie or DOM issue. The render used `chromium.launch(headless=True)` with the
**default** user-agent (which contains `HeadlessChrome`), exposed
`navigator.webdriver = true`, and sent no `Accept-Language`. Those are textbook
automation tells; the protection served a 403 and we screenshotted it.

## Decision

Give the render a **realistic browser identity** plus minimal **stealth** patches, both
config-driven. This is the standard baseline any page-rendering tool needs — not an
exotic evasion stack.

- **Launch:** `--disable-blink-features=AutomationControlled`; `headless` is now a
  setting (`RENDER_HEADLESS`, default `true`). Headful (under a display such as xvfb)
  is itself less detectable; flip the flag where a display is available.
- **Context:** realistic `user_agent`, `locale`, `timezone_id`, and an
  `Accept-Language` header — all configurable (`RENDER_USER_AGENT`, `RENDER_LOCALE`,
  `RENDER_TIMEZONE`, `RENDER_ACCEPT_LANGUAGE`).
- **Stealth init script** (`render_scripts/stealth.js`, gated by `RENDER_STEALTH`):
  masks `navigator.webdriver`, fills `navigator.languages`/`plugins`, ensures
  `window.chrome`, and patches `permissions.query`. Injected via `add_init_script` so it
  runs before page scripts.

Browser-side scripts now live as standalone `.js` files under `render_scripts/`, loaded
with a cached helper — they are not subject to Python line-length and are editable/lint-
able as JS.

## What this is NOT

This is the **baseline + light stealth** tier, deliberately. It defeats *naive*
detection. It is **not** a guarantee against sophisticated anti-bot systems
(Cloudflare/Akamai/DataDome-class), which may still block — defeating those typically
requires residential proxies and CAPTCHA solving. We did **not** build that, because:

- It generally **violates the target site's Terms of Service** (mobile.de's terms
  prohibit automated access). Authorization is the user's responsibility.
- It is an arms race with ongoing cost. For durable monitoring, an **official API or
  data feed** is the right path where a site hard-blocks scraping.

## Trade-offs

- **+** No new dependency (hand-rolled minimal stealth, not a plugin). Cheap, config-
  gated, off-switchable.
- **−** Headful mode needs a display in the container (xvfb); the Dockerfile is **not**
  changed here — headless stays the default. Enable xvfb before setting
  `RENDER_HEADLESS=false`.
- **−** Effectiveness is not guaranteed on strongly-protected sites.

## Concepts to look up

- **Browser fingerprinting / bot detection**: `navigator.webdriver`, the
  `HeadlessChrome` UA token, the `AutomationControlled` blink feature, TLS/JA3 and
  canvas/WebGL fingerprints.
- **`add_init_script` / evaluateOnNewDocument** — running patches before page JS.
- **playwright-stealth / puppeteer-extra-stealth** — the fuller version of what
  `stealth.js` does by hand.
- **Headless vs. headful + xvfb** — why a virtual display reduces detectability.
- **robots.txt, Terms of Service, and official APIs** — the legal/ethical frame for
  automated access, and the sustainable alternative to evasion.

## Graceful blocked state (implemented)

When the baseline isn't enough (e.g. mobile.de behind **Akamai Bot Manager**, which
returns a 403 at the edge before page JS runs — no browser-side patch can change that),
the render now *detects* the block instead of presenting the 403 page as real content:

- `worker.py` captures the `page.goto` response status + body and runs
  `_detect_access_block`, driven conservatively by HTTP status (401/403/429, or 503 with
  a vendor/phrase signal) so normal pages aren't misflagged. Vendor (Akamai/Cloudflare/
  DataDome/Imperva/PerimeterX) is best-effort labelling from headers/cookies/body.
- Surfaced as `accessBlock` on the page-session response (Pydantic `AccessBlock`, zod
  `accessBlockSchema`), and the builder shows a clear "this site blocks automated access"
  notice (`AccessBlockNotice`) above the snapshot.

This makes the whole class of bot-protected sites fail honestly rather than looking
broken — and reinforces that the durable path for such sites is an official API, not
defeating the protection.

## Follow-ups (not done here)
- Optional xvfb layer in the Dockerfile to make `RENDER_HEADLESS=false` turnkey.
- Per-website render overrides (UA/locale) once monitoring spans many sites.

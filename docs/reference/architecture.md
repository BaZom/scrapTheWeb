# Architecture — current state (source of truth)

Skrowt is a multi-tenant web app for building and running visual extraction sprouts
against public listing/detail pages. This is the single source of truth for the architecture;
the builder's UI/flow detail lives in [builder.md](builder.md).

Product loop: render a URL → reduce blocking overlays → capture screenshot + DOM → user picks
the repeating item and fields → generate selectors & preview → save the sprout → run on
demand from the Run Test workspace → review real records + changes → export CSV/JSON.

## System components

| Component | Tech | Role |
|-----------|------|------|
| **Frontend** | Next.js (app router), React, Tailwind, Zod | Client workbench: auth, render, builder, preview, runs, diffs, exports. `frontend/`. |
| **API** | FastAPI (Python 3.11) | Auth, tenancy, page sessions, selectors, preview, sprouts, runs, exports, limits, SSRF, health, metrics. `backend/app/`. |
| **Worker** | arq + Playwright | Renders pages, captures DOM + screenshot, reduces overlays. Shares the backend image; Prometheus metrics on :9100. `backend/app/worker.py`. |
| **Postgres** | SQLAlchemy (async) | Durable source of truth: users/orgs, sessions, saved sprouts, runs, records, tokens, API keys, usage counters. |
| **Redis** | redis-py / arq | Job queue, rate-limit windows, and the short-lived `domNodes`/session payload. |
| **S3 / MinIO** | boto3 | Rendered `screenshot.png` + `page.html` artifacts (MinIO locally). |

```text
              +------------------+
   Browser -->| Next.js frontend |---+
              +------------------+   | bearer token / X-API-Key
                                     v
+-----------+      +-------------------+      +-----------------+
| Postgres  |<---->| FastAPI API       |----->| Redis           |
+-----------+      +-------------------+      +-----------------+
       ^                  |        |                  ^
       |                  |        v                  |
       |          +--------------+ +----------------+ |
       |          | S3 / MinIO   | | arq Worker     |-+
       |          +--------------+ +----------------+
       |                              |
       +------------------------------+
```

## Render → extract pipeline

1. **Render** (`worker.py`): Playwright loads the URL (SSRF-validated), blocks ad/tracker
   requests (`RENDER_BLOCK_ADS`), dismisses consent overlays (`overlay_reduction.py`), waits
   for the consent-rebuild DOM to settle (`_wait_for_dom_stable`).
2. **Capture** (`render_scripts/dom_candidates.js`): a flat `domNodes` list (every visible
   element: tag, text ≤160c, selected attrs `id/class/role/itemprop/href/src/data-*`, classes,
   parent, geometry) + scored repeating "card" candidates. Plus a full-page screenshot.
3. **Persist**: screenshot + `page.html` → **S3**; `domNodes` + candidates → **Redis** (TTL);
   a `page_sessions` row → **Postgres**.
4. **Build** (no writes): selector generation and the fast snapshot preview read `domNodes`
   from **Redis** and run the in-house matcher. List previews return one row per matched
   item container; single-page previews return one page-wide row
   (`selector_generator.py`).
5. **Save**: the sprout (item selector + fields) → **Postgres** (`recipes` + `recipe_versions`).
6. **Run**: the worker re-fetches the live page via the same render path, `recipe_runner.py`
   parses the HTML and extracts records (inside matched containers for listing sprouts, or as
   one page-wide row for single-page sprouts), diffs vs the previous run, persists
   records/changes; CSV/JSON export streams from persisted records.

## Where data lives, and when it's written

Nothing is written while building fields or previewing. **Two write moments only:** *Render*
(S3 + Redis + a `page_sessions` row) and *Save sprout* (Postgres). Build-time selector
generation/preview read `domNodes` from Redis; the saved run re-fetches live HTML.

## Two selector matchers (intentional)

- **Snapshot matcher** — `selector_generator.py`, over the flat `domNodes`. Fast, in-memory,
  a bounded CSS subset (`>`-chained `tag`/`.class`/`#id`/`[attr]`/`:nth-of-type`). Used at
  build time: `generate_selector`, `preview_from_snapshot`. For list pages, preview row count
  follows the matched container count instead of a hidden fixed sample limit.
- **HTML matcher** — `recipe_runner.py`, over parsed HTML. Authoritative. Used by the saved
  **run** (and the legacy `/preview`), where full fidelity matters. It preserves the builder's
  shape contract: listing sprouts scope fields to each item container; single-page sprouts
  evaluate field selectors page-wide.

Both are fed selectors from the same generator, so a generated selector behaves consistently;
the snapshot path trades fidelity (text truncation) for speed at build time. See
[builder.md §4](builder.md).

## Caching

`page_html_cache.py` — a best-effort, per-replica, in-process TTL+LRU cache of `page.html` in
front of S3 (ADR 0008). S3 stays the source of truth; a miss/restart/eviction falls back to
S3. Configurable via `PAGE_HTML_CACHE_*`. The fast builder preview reads the Redis snapshot
(not HTML), so it doesn't depend on this cache.

## Data model

Main persisted entities (Postgres; tenant-owned data scoped by `organization_id`, with
membership checks on org-scoped paths):

- `users`, `organizations`, `memberships` — identity + tenant boundary.
- `refresh_tokens`, `email_verification_tokens`, `password_reset_tokens` — hashed, rotated/
  single-use, TTL-bounded auth tokens.
- `api_keys` — hashed `sk_*` keys with display prefix, last-used + revocation state.
- `page_sessions` — rendered URL, status, screenshot key, HTML key, DOM cache identity.
- `websites`, `recipes`, `recipe_versions` — saved sprout definitions (selectors, fields,
  pagination, dedup settings).
- `extraction_runs`, `extracted_records`, `change_events` — run history + diff output.
- `usage_counters` — monthly quota accounting per org and metric.

## Overlay reduction

The builder uses a **frozen screenshot + DOM overlay picker**, not a live embedded site.
Before capture, Playwright runs a backend-only overlay-reduction pass looking for non-invasive
dismissal controls (reject, necessary-only, close, later, skip, "no thanks") across the page
and frames, and sends `Escape` for stuck modals. It does **not** store cookies/localStorage,
does not accept-all, and adds no user-authored steps. Sprout runs use the same render path, so
preview and run benefit equally. Overlay-dismissal metadata remains backend metadata; it is not
shown as a builder status chip.

## Auth surface

JWT access tokens + rotating refresh tokens; refresh/verification/reset tokens and API keys
are stored only as salted SHA-256 digests. Key endpoints: `POST /auth/{register,login,refresh,
logout}`, `/auth/sessions/revoke-all`, `/auth/verify/*`, `/auth/password-reset/*`,
`GET /me/dashboard`, `/me/api-keys` CRUD. Dependencies: `current_user` (JWT only),
`current_user_or_api_key` (JWT or `X-API-Key`, for run read/export), `require_org_member`
(tenant scoping). In local dev, verification/reset tokens are emitted to API logs; production
should wire a real email provider.

## Security posture

- **SSRF** (`ssrf.py`): only `http`/`https`; blocks localhost/metadata; resolves DNS before
  fetch; rejects private/loopback/link-local/multicast/reserved/unspecified IPs.
- **CORS** via `CORS_ALLOWED_ORIGINS`; **security headers** (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`;
  HSTS at the proxy).
- **Sanitized errors** (generic `Internal Server Error`; real traces logged / Sentry).
- **Limits & quotas** (`limits.py`): per-user rate limits + per-org monthly quotas on render/
  run/export. **`/metrics`** is unauthenticated — protect it at the network/proxy in prod.

## Cross-cutting

- **Run progress:** SSE (`GET /api/runs/{id}/events`) with a polling fallback.
- **Observability:** structured JSON logs with request/job correlation (`X-Request-ID`);
  API `/metrics`, worker `:9100/metrics`; OTEL/Sentry env-driven. See
  [observability.md](observability.md).
- **Operating the stack:** [runbook.md](runbook.md) (env vars, procedures).

## Frontend structure

Next.js app router. `frontend/lib/api.ts` owns the HTTP client + Zod response schemas; auth
state is persisted locally and refreshed on expiry. The builder is a compact client-side
workbench (`app/page.tsx` + `app/components/builder-view.tsx`) for configuring and snapshot
previewing sprouts. Live execution is started and reviewed in the Run Test screen
(`product-screens.tsx`), which shows real extracted records, change diffs, recent tests for
the selected sprout, and exports; Runs remains cross-sprout execution history. A future
iteration could split these into dedicated routes (login, settings, sprout create/detail, run
detail) without changing backend contracts. Builder internals: [builder.md](builder.md).

## Testing strategy

Backend unit tests cover selector generation, preview extraction, change detection, SSRF
guards, auth/token/API-key helpers, in-memory rate limits, recipe-runner behavior, security
headers. Pure frontend logic (reducer, selector helpers) is unit-tested (Vitest); the builder
click-through is verified by running the stack. Smoke scripts (`scripts/smoke.sh`) cover live
auth/render/picker/preview/recipe/run/export, limits/quota, observability, and a full
books.toscrape.com demo. CI runs backend lint/static + smoke guards + frontend lint/typecheck.

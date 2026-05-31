# ScrapTheWeb Architecture

ScrapTheWeb is a multi-tenant web app for building and running visual
extraction recipes against public listing pages. The core product loop is:

1. Render a public URL with Playwright.
2. Reduce common blocking overlays before capture.
3. Store the screenshot and rendered HTML.
4. Let the user select a repeated container and label fields.
5. Generate selectors and preview extracted rows.
6. Save the recipe, run it on demand, persist records, compute changes, and
   export CSV or JSON.

## System Components

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

- **Frontend (`frontend/`)**: Next.js app router, React, Tailwind, and a
  Zod-validated API client. The current UI is a client-side workbench covering
  auth, account controls, rendering, picking, field mapping, previews, runs,
  diffs, and exports.
- **API (`backend/app/`)**: FastAPI service for auth, tenancy, page sessions,
  recipes, extraction runs, exports, limits, health checks, metrics, and
  security middleware.
- **Worker (`backend/app/worker.py`)**: arq background worker using Playwright
  for rendering and extraction jobs. It shares the backend image and exposes
  Prometheus metrics on port 9100.
- **Postgres**: Durable source of truth for users, organizations, recipes,
  runs, records, tokens, API keys, and usage counters.
- **Redis**: arq queue, rate-limit windows, and short-lived DOM/session cache.
- **S3-compatible storage**: Rendered screenshots and HTML artifacts. MinIO is
  used locally.

## Data Model

Main persisted entities:

- `users`: email, password hash, and email verification timestamp.
- `organizations` and `memberships`: tenant boundary and user membership.
- `refresh_tokens`: hashed refresh tokens, rotated on refresh and revoked on
  logout, reset, or session revocation.
- `email_verification_tokens` and `password_reset_tokens`: hashed, single-use,
  TTL-bounded auth flow tokens.
- `api_keys`: hashed `sk_*` keys with display prefix, last-used tracking, and
  revocation state.
- `page_sessions`: rendered URL, status, screenshot key, HTML key, and DOM
  cache identity.
- `websites`, `recipes`, and `recipe_versions`: saved extraction definitions,
  including selectors, fields, pagination, and deduplication settings.
- `extraction_runs`, `extracted_records`, and `change_events`: run history and
  diff output.
- `usage_counters`: monthly quota accounting per organization and metric.

Tenant-owned data is scoped by `organization_id`; API paths that operate inside
an organization require membership checks.

## Core Data Flow

### Render and Pick

1. The frontend submits a URL to the API.
2. The API validates rate limits, monthly quota, and SSRF rules.
3. A render job is enqueued in Redis.
4. The worker renders the URL with Playwright, tries to reduce common blocking
   overlays, stores screenshot and HTML in S3-compatible storage, extracts a DOM
   summary, and updates the page session.
5. The frontend displays the frozen screenshot and DOM overlays so the user can
   choose a repeated container and map fields.

### Overlay Reduction

The builder uses a frozen screenshot plus DOM overlay picker, not a live embedded
website. Before the screenshot is captured, Playwright runs a short backend-only
overlay-reduction pass. It looks for common non-invasive dismissal controls such
as reject, necessary-only, close, later, skip, and "no thanks" buttons or links
across the page and its frames. It also sends `Escape` when a modal dialog remains.

This pass does not store cookies or localStorage, does not accept all cookies by
default, and does not add user-authored setup steps to recipes. Recipe runs use
the same Playwright rendering path, so the preview and run paths both benefit
from the same automatic overlay reduction.

The page-session response includes `overlayDismissals` metadata when Playwright
dismissed something. The frontend uses that only as a small status badge; the
user's main workflow remains selecting containers and fields on the resulting
snapshot.

### Preview, Save, Run, Export

1. The user maps fields to selectors and requests a preview.
2. The API extracts rows from the cached/rendered HTML and returns preview data.
3. Saving creates a recipe and recipe version.
4. Running a recipe enqueues a worker job, renders with the same overlay-reduction
   path, persists extracted records, and computes new/changed/removed records
   against the previous run.
5. CSV and JSON exports are streamed from persisted run records.

## Auth Surface

The primary session flow uses JWT access tokens and rotating refresh tokens.
Refresh tokens, verification tokens, reset tokens, and API keys are stored only
as salted SHA-256 digests.

Key endpoints:

```text
POST /auth/register
POST /auth/login
POST /auth/refresh
POST /auth/logout
POST /auth/sessions/revoke-all
POST /auth/verify/request
POST /auth/verify/confirm
POST /auth/password-reset/request
POST /auth/password-reset/confirm
GET  /me/dashboard
POST /me/api-keys
GET  /me/api-keys
DELETE /me/api-keys/{id}
```

Authentication dependencies:

- `current_user`: accepts JWT bearer tokens only.
- `current_user_or_api_key`: accepts JWT bearer tokens or `X-API-Key`. This is
  used by run read/export endpoints so automation can retrieve data without a
  full browser session.
- `require_org_member`: enforces organization membership for tenant-scoped
  endpoints.

In local development, email verification and password-reset tokens are emitted
to API logs for manual testing. Production deployments should wire those flows
to a real email provider.

## Security Posture

- **SSRF protection**: URL validation accepts only `http` and `https`, blocks
  localhost and metadata hostnames, resolves DNS before fetch, and rejects
  private, loopback, link-local, multicast, reserved, and unspecified IPs.
- **CORS**: Controlled by `CORS_ALLOWED_ORIGINS`; only the deployed frontend
  origins should be allowed outside local development.
- **Security headers**: The API adds `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, and
  `Cross-Origin-Resource-Policy`. HSTS belongs at the HTTPS reverse proxy.
- **Sanitized errors**: Unhandled exceptions return a generic
  `{"detail": "Internal Server Error"}` while real stack traces are logged and
  sent to Sentry when configured.
- **Limits and quotas**: High-cost render, run, and export operations enforce
  per-user rate limits and per-organization monthly quotas.
- **Metrics exposure**: `/metrics` is unauthenticated for local and cluster
  scraping. In production, protect it with network policy or reverse-proxy
  authentication.

## Observability

The API and worker emit structured JSON logs with request/job correlation
fields. `X-Request-ID` is accepted from callers or generated by the API, echoed
back on responses, and bound into logs.

Metrics:

- API: `/metrics` with FastAPI/Prometheus defaults plus high-cost operation
  counters.
- Worker: `:9100/metrics` with job counters and duration histograms.

Tracing and error tracking are environment driven:

- `OTEL_EXPORTER_OTLP_ENDPOINT` enables OpenTelemetry export.
- `SENTRY_DSN` enables backend Sentry.
- `NEXT_PUBLIC_SENTRY_DSN` enables frontend Sentry.

See [OBSERVABILITY.md](OBSERVABILITY.md) for operational details.

## Frontend Structure

The frontend is a Next.js app router project. `frontend/lib/api.ts` owns the
HTTP client and response schemas. Auth state is persisted locally and refreshed
on expired access tokens.

The current UI is intentionally compact and product-complete. A future design
iteration can split the workbench into dedicated routes for login, settings,
recipe creation, recipe details, and run details without changing backend
contracts.

## Testing Strategy

Backend tests cover:

- selector generation
- preview extraction
- change detection
- SSRF guards
- password, JWT, refresh-token, verification-token, reset-token, and API-key
  helpers
- in-memory rate limits
- recipe runner behavior
- security headers

Smoke scripts cover live integration behavior:

- auth and session flows
- render, picker, preview, recipe, run, export
- limits and quota behavior
- observability and request IDs
- full books.toscrape.com demo flow

CI runs backend lint/static checks, smoke guards, frontend lint, and frontend
type checks. Full live smoke checks should be run against local Docker Compose
and staging before release.

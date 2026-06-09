# ScrapTheWeb

ScrapTheWeb is a production-oriented visual recipe builder for extracting
structured data from public listing pages. A user signs in, renders a page with
a hosted browser, clicks a repeated container, labels fields, previews extracted
rows, saves the recipe, runs it on demand, reviews changes, and exports CSV or
JSON.

The local stack includes the full product surface:

- Next.js frontend with authentication, visual picker, field mapping, previews,
  run results, exports, account controls, and API key management.
- FastAPI backend with tenant-scoped auth, recipe and run APIs, limits, quotas,
  security headers, CORS allow-listing, SSRF protection, and sanitized errors.
- arq worker for Playwright rendering and extraction jobs.
- Postgres for durable application data, Redis for queues/rate limits/cache,
  and S3-compatible storage for rendered artifacts.
- Structured logs, request IDs, Prometheus metrics, OpenTelemetry hooks, and
  optional Sentry integration.

ScrapTheWeb is intended for public, permitted web pages. It does not include
anti-bot evasion, CAPTCHA solving, social scraping, browser extensions,
scheduled crawling, payments, or AI-generated extraction logic.

## Architecture

```text
Browser
  |
  v
Next.js frontend
  |
  | HTTPS / bearer token / X-API-Key
  v
FastAPI API  <---->  Postgres
  |   |
  |   +-------> Redis / arq queue
  |                 |
  |                 v
  |              Worker + Playwright
  |                 |
  v                 v
S3-compatible storage for screenshots and rendered HTML
```

See:

- [docs/reference/](docs/reference/) — current-state source of truth: architecture (system
  design, data model, security posture, API surface, testing), the builder, observability,
  and the runbook. Start at [docs/reference/README.md](docs/reference/README.md).
- [docs/adr/](docs/adr/) — decision history. [docs/backlog/](docs/backlog/) — open bugs &
  planned work.

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Then open:

- App: http://localhost:3000
- API: http://localhost:8000
- API liveness: http://localhost:8000/health/live
- API readiness: http://localhost:8000/health/ready
- API metrics: http://localhost:8000/metrics
- Worker metrics: http://localhost:9100/metrics
- MinIO console: http://localhost:9001 (`minioadmin` / `minioadmin`)

For local development, `.env.example` contains safe defaults. Production and
staging deployments must override all secrets, origins, storage credentials,
and observability endpoints.

## Demo Flow

1. Register at http://localhost:3000.
2. Paste `https://books.toscrape.com/` into the render form.
3. Select a repeated book card as the container.
4. Add fields such as title, detail URL, and price.
5. Preview the extracted rows.
6. Save the recipe.
7. Run the recipe once.
8. Review persisted records and change events.
9. Export CSV or JSON.
10. Create an API key and call an allowed read endpoint with `X-API-Key`.

Email verification and password reset are wired for local development. Tokens
are logged by the API container so the flows can be tested without an email
provider:

```bash
docker compose logs api | grep email_verification_token_issued
docker compose logs api | grep password_reset_token_issued
```

Production deployments should replace log-based token delivery with a real
email provider.

## Repository Layout

```text
backend/             FastAPI app, arq worker, Alembic migrations, tests
frontend/            Next.js app router UI, Tailwind, typed API client
scripts/             Local and live smoke checks
docs/                Architecture, runbook, observability docs
.github/workflows/   CI checks
docker-compose.yml   Local development stack
.env.example         Safe configuration reference
```

Internal planning files, build notes, and implementation-history notes are
intentionally ignored by Git. The public documentation in `README.md` and
`docs/` is the canonical project documentation.

## Auth And API Keys

The app supports:

- Email/password registration and login.
- JWT access tokens with refresh-token rotation.
- Email verification with hashed, single-use, TTL-bounded tokens.
- Password reset with session revocation after a successful reset.
- Logout and "revoke all sessions".
- API key create/list/revoke. Raw keys are displayed once, stored only as
  salted hashes, and accepted through the `X-API-Key` header for run reads and
  exports.

Useful auth endpoints include:

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

## Tests And Checks

Backend unit tests:

```bash
cd backend
pytest
```

Static guards and offline smoke checks:

```bash
scripts/smoke.sh
```

Frontend checks:

```bash
cd frontend
npm install
npm run lint
npm run typecheck
npm run build
```

Live smoke checks require `docker compose up`:

```bash
API_BASE_URL=http://localhost:8000 python3 scripts/smoke_auth.py
API_BASE_URL=http://localhost:8000 python3 scripts/smoke_auth_completion.py
API_BASE_URL=http://localhost:8000 python3 scripts/smoke_limits.py
API_BASE_URL=http://localhost:8000 python3 scripts/smoke_observability.py
API_BASE_URL=http://localhost:8000 python3 scripts/smoke_e2e.py
```

The GitHub Actions workflow runs backend lint/static checks, smoke guards,
frontend lint, and frontend type checks.

## Deployment Notes

ScrapTheWeb is container-ready. A production deployment needs:

- Managed Postgres, Redis, and S3-compatible storage.
- Long random `JWT_SECRET` and `REFRESH_TOKEN_SECRET` values in a secret store.
- A strict `CORS_ALLOWED_ORIGINS` value for the deployed frontend origin.
- HTTPS termination and HSTS at the reverse proxy or ingress layer.
- Private S3 bucket, database backups, and migration execution before traffic.
- Prometheus scraping for API and worker metrics.
- Optional Sentry DSNs and OTLP endpoint for error tracking and traces.
- A real email provider for verification and password-reset delivery.

Use [docs/reference/runbook.md](docs/reference/runbook.md) as the staging and production checklist.

# RUNBOOK

Operational guide for Skrowt. Covers local development, environment
configuration, migrations, deployment, incident response, and the staging
launch checklist.

## Environment variables

All variables are listed in `.env.example`. The defaults in this file are
**safe for local development** -- production deployments must override the
secrets and origins.

### Core

| Var | Description |
| --- | --- |
| `APP_ENV` | `local`, `staging`, or `production`. Used as Sentry environment. |
| `LOG_LEVEL` | `debug`, `info` (default), `warning`, `error`. |
| `DATABASE_URL` | Async Postgres URL, e.g. `postgresql+asyncpg://user:pw@host:5432/db`. |
| `REDIS_URL` | Redis URL for rate limits + arq queue. |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, `S3_REGION` | S3-compatible object store. |
| `FRONTEND_ORIGIN` | Legacy field; kept for back-compat. |

### Auth + security

| Var | Description |
| --- | --- |
| `JWT_SECRET` | Long random string. Rotate by setting a new value and restarting; existing access tokens become invalid. |
| `JWT_ACCESS_TOKEN_MINUTES` | Default 15. Access token TTL. |
| `REFRESH_TOKEN_SECRET` | Long random string used as a per-purpose salt for refresh, verification, password-reset, and API-key hashes. **Rotating this invalidates every token at rest.** |
| `REFRESH_TOKEN_DAYS` | Default 30. Refresh token TTL. |
| `EMAIL_VERIFICATION_TOKEN_HOURS` | Default 48. |
| `PASSWORD_RESET_TOKEN_MINUTES` | Default 30. |
| `REQUIRE_EMAIL_VERIFICATION` | `true`/`false` (default `false`). When `true`, login is blocked for unverified users. |
| `CORS_ALLOWED_ORIGINS` | Comma-separated list, e.g. `https://app.example.com,https://staging.example.com`. |

### Limits + quotas

| Var | Default |
| --- | --- |
| `RENDER_RATE_LIMIT_PER_HOUR` | 30 |
| `RECIPE_RUN_RATE_LIMIT_PER_HOUR` | 20 |
| `EXPORT_RATE_LIMIT_PER_HOUR` | 60 |
| `ORG_RENDER_QUOTA_PER_MONTH` | 200 |
| `ORG_RECIPE_RUN_QUOTA_PER_MONTH` | 100 |
| `ORG_EXPORT_QUOTA_PER_MONTH` | 500 |

### Observability

| Var | Description |
| --- | --- |
| `SENTRY_DSN` / `SENTRY_TRACES_SAMPLE_RATE` | Empty disables Sentry. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP/HTTP collector URL. Empty = no-op. |
| `OTEL_CONSOLE_EXPORTER` | `true` prints spans to stdout. |
| `OTEL_SERVICE_NAME_API` / `OTEL_SERVICE_NAME_WORKER` | Resource names. |
| `WORKER_METRICS_PORT` | Default 9100. |
| `NEXT_PUBLIC_SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_ENVIRONMENT` / `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | Frontend Sentry. |

## Build and run

### Local docker compose

```bash
cp .env.example .env   # then edit JWT_SECRET, REFRESH_TOKEN_SECRET
docker compose up --build
```

### Backend image (standalone)

```bash
cd backend
docker build --target api -t scraptheweb-api .
docker build --target worker -t scraptheweb-worker .
```

### Frontend image (standalone)

```bash
cd frontend
docker build -t scraptheweb-frontend .
```

### Migrations

Migrations are Alembic, located in `backend/alembic/versions/`. The API
container runs `alembic upgrade head` on startup.

```bash
# Apply migrations manually (e.g. before a blue/green deploy)
docker compose exec -T api alembic upgrade head

# Check current revision
docker compose exec -T api alembic current

# Generate a new migration (during development)
docker compose exec -T api alembic revision -m "describe change"
```

## Staging checklist

Before pointing real users at a deployment:

- [ ] `JWT_SECRET` and `REFRESH_TOKEN_SECRET` are unique, long, and stored
      in a real secret store (not committed to git).
- [ ] `CORS_ALLOWED_ORIGINS` contains only the production frontend
      origin(s).
- [ ] Postgres is backed up; point-in-time recovery is enabled.
- [ ] Redis has persistence enabled or is documented as ephemeral
      (rate-limit windows are cheap to lose; the arq queue is not).
- [ ] S3 bucket is private (no public read), versioning on if exports
      retention matters.
- [ ] HTTPS termination at the reverse proxy. Set HSTS there, not in the
      app (so HTTP-only dev keeps working).
- [ ] `SENTRY_DSN`, `OTEL_EXPORTER_OTLP_ENDPOINT`, and Prometheus scrapes
      are wired.
- [ ] `REQUIRE_EMAIL_VERIFICATION=true` if you require verified-email
      gating before login (defaults to off so the local demo still runs).
- [ ] `docker compose exec api alembic current` matches the latest
      migration revision shipped with the release (`0006_auth_completion`
      for the current MVP).
- [ ] `python3 scripts/smoke_observability.py`,
      `python3 scripts/smoke_limits.py`,
      `python3 scripts/smoke_auth_completion.py`, and
      `python3 scripts/smoke_e2e.py` pass against the staging URL.
- [ ] `/health/ready` returns `ok` and all three dependencies report
      `ok=true`.

## Incident response

### API or worker down

1. Check `/health/live` (process) and `/health/ready` (dependencies).
2. `docker compose logs api --tail 200` and `docker compose logs worker
   --tail 200`. JSON logs are filterable by `request_id`/`job_id`.
3. Compare `scraptheweb_*` counters at `/metrics` and `:9100/metrics`
   against expected baselines.

### Auth/security incident

- **Suspected compromised user**: call `POST /auth/sessions/revoke-all`
  with the user's bearer token, or revoke directly in Postgres:
  `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = '...'`.
- **Compromised API key**: revoke via the dashboard or
  `DELETE /me/api-keys/{id}`. The key's hash is then ignored by
  `current_user_or_api_key`.
- **Suspected secret rotation needed**: rotate `JWT_SECRET` to force every
  outstanding access token to be re-issued. Rotating
  `REFRESH_TOKEN_SECRET` invalidates *all* refresh, verification, reset,
  and API key hashes -- coordinate with users first.

### SSRF / abusive scraping

The SSRF guard rejects private, loopback, link-local, multicast, reserved,
and unspecified addresses, plus `localhost` and the GCP metadata host. If
a new target needs to be denied:

1. Add a host or address check to `app/ssrf.py`.
2. Add a regression test to `backend/tests/test_ssrf.py`.

### Rate-limit pressure

`scraptheweb_page_render_requests_total{outcome="rate_limited"}` and the
sprout-run + export equivalents indicate per-user pressure. Increase
`*_RATE_LIMIT_PER_HOUR` or `ORG_*_QUOTA_PER_MONTH` and restart the API.

## Backups + retention

- Postgres: nightly base backup + WAL archive recommended.
- S3: versioning on the screenshots bucket if rendered HTML retention
  matters.
- No PII beyond emails; user passwords are bcrypt; tokens at rest are
  SHA-256 hashes salted with `REFRESH_TOKEN_SECRET`.

## Smokes (manual gate)

```bash
scripts/smoke.sh                              # static guards + offline smokes
API_BASE_URL=$BASE python3 scripts/smoke_auth.py
API_BASE_URL=$BASE python3 scripts/smoke_auth_completion.py
API_BASE_URL=$BASE python3 scripts/smoke_limits.py
API_BASE_URL=$BASE python3 scripts/smoke_observability.py
API_BASE_URL=$BASE python3 scripts/smoke_e2e.py
```

`smoke_e2e.py` exercises the full register / render / preview / save /
run / export / API-key flow against the live stack.

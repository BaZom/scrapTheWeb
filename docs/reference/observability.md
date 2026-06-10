# Observability

ScrapTheWeb ships with structured logs, metrics, traces, and error tracking that
are configurable through environment variables. Every integration is **disabled
by default locally** so `docker compose up` works without any external
observability credentials.

## Logs

The API and worker emit structured JSON via `structlog`. The default processor
chain is configured in `backend/app/observability/logging.py` and includes:

- `service` (from `OTEL_SERVICE_NAME_API` / `OTEL_SERVICE_NAME_WORKER`)
- `level`, `timestamp` (ISO-8601 UTC), `event`
- request context bound by `RequestContextMiddleware`: `request_id`, `path`,
  `method`, and, when available, `user_id`, `org_id`
- job context bound by worker jobs: `job_id`, `kind`, `run_id`,
  `page_session_id`, `recipe_id`, `org_id`, `user_id`
- secret redaction: keys matching `password|secret|token|authorization|api[_-]?key|jwt|cookie`
  are masked as `***`

Every request gets a stable `request_id`. Inbound `X-Request-ID` headers are
respected, otherwise a UUID-hex id is generated. The id is echoed back as
`X-Request-ID` on the response so it can be correlated across clients,
load balancers, logs, and traces.

## Metrics

- API: `GET /metrics` returns Prometheus text exposition. Default HTTP metrics
  are exposed via `prometheus-fastapi-instrumentator`. The API also exposes
  custom counters for high-cost requests:
  - `scraptheweb_page_render_requests_total{outcome}`
  - `scraptheweb_recipe_run_requests_total{outcome}`
  - `scraptheweb_export_requests_total{format, outcome}`
  Outcome labels include `accepted`, `rate_limited`, `quota_exceeded`,
  `ssrf_rejected`, `enqueue_failed`, `success`.
- Worker: starts a Prometheus HTTP server on `WORKER_METRICS_PORT` (default
  `9100`) exposing:
  - `scraptheweb_worker_jobs_total{kind, outcome}`
  - `scraptheweb_worker_job_duration_seconds{kind, outcome}` (histogram)
  - the default `process_*` and `python_*` metrics from `prometheus-client`
  The port is published from the worker container in `docker-compose.yml`.

## Traces

OpenTelemetry is initialized in `backend/app/observability/tracing.py` for both
API and worker. The API request span is created by
`opentelemetry-instrumentation-fastapi`. Set
`OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318/v1/traces` to ship spans
to an OTLP/HTTP collector. Set `OTEL_CONSOLE_EXPORTER=true` to print spans to
stdout for local debugging. When neither is set, the SDK is installed but
exports nowhere, so it is a no-op.

## Error tracking

Sentry is initialized in `backend/app/observability/sentry.py` for the API and
worker. The frontend Sentry SDK is initialized in `frontend/lib/sentry.ts`. All
three are gated on a DSN environment variable:

- API/worker: `SENTRY_DSN`, optionally `SENTRY_TRACES_SAMPLE_RATE`
- Frontend: `NEXT_PUBLIC_SENTRY_DSN`,
  `NEXT_PUBLIC_SENTRY_ENVIRONMENT`,
  `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`

If the DSN is empty, the SDK is not loaded and the app starts normally.

## Health

- `GET /health/live` is process-only: returns `200 {"status": "ok"}` as long as
  the API event loop is running. Suitable for kubernetes liveness probes.
- `GET /health/ready` actively checks Postgres, Redis, and S3. Returns
  `dependencies[].ok` per dependency. Use for kubernetes readiness probes and
  load balancer health checks.
- The API container's docker healthcheck calls `/health/ready` so that traffic
  is only routed to the API once dependencies are reachable.

## Graceful shutdown

- API: the FastAPI `lifespan` closes the arq pool, Redis client, and SQLAlchemy
  engine on shutdown, then flushes pending Sentry events.
- Worker: the arq `on_shutdown` hook closes the Redis client and SQLAlchemy
  engine, then flushes pending Sentry events. Resource closures are guarded so
  a single broken resource does not prevent the others from cleaning up.

## Production checklist

- Wire `SENTRY_DSN` for API, worker, and frontend.
- Wire `OTEL_EXPORTER_OTLP_ENDPOINT` to a managed OTLP collector or
  hosted backend (Grafana Tempo, Honeycomb, Datadog, etc.).
- Scrape both `<api>:8000/metrics` and `<worker>:9100/metrics` from your
  Prometheus deployment.
- Ship logs to a centralized aggregator that can parse JSON and search on
  `request_id`, `job_id`, and `org_id`.
- Define alerting on the custom counters (e.g. `worker_jobs_total{outcome="failed"}`)
  and on `http_requests_total{status="5xx"}`.

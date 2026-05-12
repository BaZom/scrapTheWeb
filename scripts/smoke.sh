#!/usr/bin/env bash
set -euo pipefail

required_files=(
  "docker-compose.yml"
  "backend/app/main.py"
  "backend/app/worker.py"
  "backend/alembic.ini"
  "backend/alembic/env.py"
  "frontend/app/page.tsx"
  ".github/workflows/ci.yml"
)

for file in "${required_files[@]}"; do
  test -f "$file"
done

grep -q "/health/live" backend/app/main.py
grep -q "/health/ready" backend/app/main.py
grep -q "/auth/register" backend/app/auth.py
grep -q "/auth/login" backend/app/auth.py
grep -q "/auth/refresh" backend/app/auth.py
grep -q "/auth/logout" backend/app/auth.py
grep -q "/me/dashboard" backend/app/auth.py
grep -q "require_org_member" backend/app/deps.py
grep -q "0001_auth_tenant_shell" backend/alembic/versions/0001_auth_tenant_shell.py
grep -q "0002_page_sessions" backend/alembic/versions/0002_page_sessions.py
grep -q "0003_recipes_runs" backend/alembic/versions/0003_recipes_runs.py
grep -q "0004_change_events" backend/alembic/versions/0004_change_events.py
grep -q "0005_usage_counters" backend/alembic/versions/0005_usage_counters.py
grep -q "/api/page-sessions" backend/app/page_sessions.py
grep -q "/selector" backend/app/page_sessions.py
grep -q "/preview" backend/app/page_sessions.py
grep -q "/api/recipes" backend/app/recipes.py
grep -q "/api/runs" backend/app/recipes.py
grep -q "/export.csv" backend/app/recipes.py
grep -q "/export.json" backend/app/recipes.py
grep -q "generate_selector" backend/app/selector_generator.py
grep -q "extract_preview_rows" backend/app/recipe_runner.py
grep -q "detect_changes" backend/app/change_detector.py
grep -q "enforce_user_rate_limit" backend/app/limits.py
grep -q "increment_usage_counter" backend/app/limits.py
grep -q "generateSelector" frontend/lib/api.ts
grep -q "previewPageSession" frontend/lib/api.ts
grep -q "createRecipe" frontend/lib/api.ts
grep -q "runRecipe" frontend/lib/api.ts
grep -q "downloadRunExport" frontend/lib/api.ts
grep -q "render_page" backend/app/worker.py
grep -q "run_recipe" backend/app/worker.py
grep -q "playwright install --with-deps chromium" backend/Dockerfile
grep -q "postgres:16" docker-compose.yml
grep -q "redis:7" docker-compose.yml
grep -q "minio" docker-compose.yml
grep -q "worker" docker-compose.yml
grep -q "JSONRenderer" backend/app/observability/logging.py
grep -q "RequestContextMiddleware" backend/app/observability/request_context.py
grep -q "PAGE_RENDER_REQUEST_COUNTER" backend/app/observability/metrics.py
grep -q "configure_sentry" backend/app/observability/sentry.py
grep -q "configure_api_tracing" backend/app/observability/tracing.py
grep -q "RequestContextMiddleware" backend/app/main.py
grep -q "configure_sentry" backend/app/main.py
grep -q "configure_worker_tracing" backend/app/worker.py
grep -q "start_worker_metrics_server" backend/app/worker.py
grep -q "WORKER_JOB_TOTAL" backend/app/worker.py
grep -q "initSentry" frontend/lib/sentry.ts
grep -q "0006_auth_completion" backend/alembic/versions/0006_auth_completion.py
grep -q "/auth/verify/request" backend/app/auth.py
grep -q "/auth/verify/confirm" backend/app/auth.py
grep -q "/auth/password-reset/request" backend/app/auth.py
grep -q "/auth/password-reset/confirm" backend/app/auth.py
grep -q "/me/api-keys" backend/app/auth.py
grep -q "/auth/sessions/revoke-all" backend/app/auth.py
grep -q "current_user_or_api_key" backend/app/deps.py
grep -q "SecurityHeadersMiddleware" backend/app/security_headers.py
grep -q "SecurityHeadersMiddleware" backend/app/main.py
grep -q "unhandled_exception_handler" backend/app/main.py
grep -q "createApiKey" frontend/lib/api.ts
grep -q "requestPasswordReset" frontend/lib/api.ts
grep -q "revokeAllSessions" frontend/lib/api.ts
test -f README.md
test -f docs/ARCHITECTURE.md
test -f docs/OBSERVABILITY.md
test -f docs/RUNBOOK.md
test -f scripts/smoke_auth_completion.py
test -f scripts/smoke_e2e.py
test -f backend/tests/test_security.py
test -f backend/tests/test_ssrf.py

SKIP_LIVE_SELECTOR_SMOKE=1 scripts/smoke_selector.py
SKIP_LIVE_PREVIEW_SMOKE=1 scripts/smoke_preview.py
SKIP_LIVE_RECIPE_SMOKE=1 scripts/smoke_recipe.py
SKIP_LIVE_EXPORT_DIFF_SMOKE=1 scripts/smoke_export_diff.py
SKIP_LIVE_LIMIT_SMOKE=1 scripts/smoke_limits.py

# Offline observability smoke needs structlog. Run it directly if the host
# python has it, otherwise fall back to the api container.
if python3 -c "import structlog" >/dev/null 2>&1; then
  python3 scripts/smoke_observability_offline.py
elif command -v docker >/dev/null 2>&1; then
  docker compose run --rm --no-deps \
    -v "$(pwd)/scripts:/app/scripts:ro" \
    api python3 /app/scripts/smoke_observability_offline.py
else
  echo "skipped smoke_observability_offline.py (structlog and docker unavailable)"
fi

echo "static smoke checks passed"

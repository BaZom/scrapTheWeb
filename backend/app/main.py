from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.auth import router as auth_router
from app.config import get_settings
from app.observability import (
    RequestContextMiddleware,
    configure_api_tracing,
    configure_logging,
    configure_sentry,
    flush_sentry,
    instrument_api,
)
from app.page_sessions import router as page_sessions_router
from app.recipes import router as recipes_router
from app.resources import check_postgres, check_redis, check_s3, lifespan_resources
from app.schemas import HealthResponse, ReadyDependency, ReadyResponse
from app.security_headers import SecurityHeadersMiddleware

settings = get_settings()
configure_logging(settings.log_level, service=settings.otel_service_name_api)
configure_sentry(
    dsn=settings.sentry_dsn,
    environment=settings.app_env,
    service=settings.otel_service_name_api,
    traces_sample_rate=settings.sentry_traces_sample_rate,
)
logger = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    logger.info("api_starting", env=settings.app_env)
    try:
        async for _ in lifespan_resources(app, settings):
            yield
    finally:
        flush_sentry()
        logger.info("api_stopped")


app = FastAPI(title="Skrowt API", version="0.0.0-slice9", lifespan=lifespan)

app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-API-Key"],
    expose_headers=["X-Request-ID"],
)

instrument_api(app)
configure_api_tracing(
    app,
    service=settings.otel_service_name_api,
    otlp_endpoint=settings.otel_exporter_otlp_endpoint,
    console=settings.otel_console_exporter,
)

app.include_router(auth_router)
app.include_router(page_sessions_router)
app.include_router(recipes_router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Sanitize 500-class errors so they never leak stack traces or detail.

    Structured exception details are still emitted to logs and Sentry via the
    observability stack; the wire response is intentionally generic.
    """
    logger.exception("unhandled_exception", path=request.url.path, method=request.method)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.get("/health/live", response_model=HealthResponse)
async def live() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/health/ready", response_model=ReadyResponse)
async def ready(request: Request) -> ReadyResponse:
    checks: list[ReadyDependency] = []

    dependency_checks: tuple[tuple[str, Callable[[], Awaitable[None]]], ...] = (
        ("postgres", lambda: check_postgres(request.app.state.engine)),
        ("redis", lambda: check_redis(request.app.state.redis)),
        ("s3", lambda: check_s3(settings)),
    )

    for name, check in dependency_checks:
        try:
            await check()
            checks.append(ReadyDependency(name=name, ok=True))
        except Exception:
            logger.exception("ready_check_failed", dependency=name)
            checks.append(ReadyDependency(name=name, ok=False))

    status = "ok" if all(check.ok for check in checks) else "degraded"
    return ReadyResponse(status=status, dependencies=checks)

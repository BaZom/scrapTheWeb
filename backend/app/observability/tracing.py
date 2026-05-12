from typing import Any

import structlog
from fastapi import FastAPI
from opentelemetry import trace
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SpanExporter,
)

logger = structlog.get_logger(__name__)

_PROVIDER_INSTALLED = False


def _build_exporter(otlp_endpoint: str | None, console: bool) -> SpanExporter | None:
    if otlp_endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import (
                OTLPSpanExporter,
            )

            return OTLPSpanExporter(endpoint=otlp_endpoint)
        except Exception as exc:
            logger.warning("otlp_exporter_unavailable", error=str(exc))
    if console:
        return ConsoleSpanExporter()
    return None


def _ensure_provider(service: str, exporter: SpanExporter | None) -> None:
    global _PROVIDER_INSTALLED
    if _PROVIDER_INSTALLED:
        return
    resource = Resource.create({"service.name": service})
    provider = TracerProvider(resource=resource)
    if exporter is not None:
        provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    _PROVIDER_INSTALLED = True


def configure_api_tracing(
    app: FastAPI,
    service: str,
    otlp_endpoint: str | None,
    console: bool = False,
) -> None:
    """Configure OTel for the API, no-op-friendly when no exporter is configured.

    Even with no exporter we install a TracerProvider so manual spans can run; spans
    just go nowhere. Instrument FastAPI so request spans are created when traces are
    actually exported.
    """
    exporter = _build_exporter(otlp_endpoint, console)
    _ensure_provider(service, exporter)
    try:
        FastAPIInstrumentor.instrument_app(app)
    except Exception as exc:
        logger.warning("fastapi_otel_instrumentation_failed", error=str(exc))


def configure_worker_tracing(
    service: str,
    otlp_endpoint: str | None,
    console: bool = False,
) -> None:
    exporter = _build_exporter(otlp_endpoint, console)
    _ensure_provider(service, exporter)


def get_tracer(name: str) -> Any:
    return trace.get_tracer(name)


__all__ = [
    "configure_api_tracing",
    "configure_worker_tracing",
    "get_tracer",
]

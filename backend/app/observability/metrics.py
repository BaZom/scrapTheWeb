import structlog
from fastapi import FastAPI
from prometheus_client import CollectorRegistry, Counter, Histogram, start_http_server
from prometheus_fastapi_instrumentator import Instrumentator

logger = structlog.get_logger(__name__)

PAGE_RENDER_REQUEST_COUNTER = Counter(
    "scraptheweb_page_render_requests_total",
    "Page render API requests by outcome.",
    labelnames=("outcome",),
)

RECIPE_RUN_REQUEST_COUNTER = Counter(
    "scraptheweb_recipe_run_requests_total",
    "Recipe run API requests by outcome.",
    labelnames=("outcome",),
)

EXPORT_REQUEST_COUNTER = Counter(
    "scraptheweb_export_requests_total",
    "Export API requests by format and outcome.",
    labelnames=("format", "outcome"),
)

WORKER_JOB_TOTAL = Counter(
    "scraptheweb_worker_jobs_total",
    "Worker jobs by kind and outcome.",
    labelnames=("kind", "outcome"),
)

WORKER_JOB_DURATION_SECONDS = Histogram(
    "scraptheweb_worker_job_duration_seconds",
    "Worker job duration in seconds by kind and outcome.",
    labelnames=("kind", "outcome"),
    buckets=(0.5, 1, 2, 5, 10, 20, 30, 60, 120, 300),
)


def instrument_api(app: FastAPI) -> None:
    """Attach the prometheus-fastapi-instrumentator and expose /metrics."""
    Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)


def start_worker_metrics_server(port: int) -> None:
    """Expose the default Prometheus collector registry on the given port for the worker.

    The custom worker counters above register against the global default registry,
    so this server is sufficient. Soft-fails so an already-bound port does not
    crash the worker.
    """
    try:
        start_http_server(port)
        logger.info("worker_metrics_server_started", port=port)
    except OSError as exc:
        logger.warning("worker_metrics_server_disabled", port=port, error=str(exc))


__all__ = [
    "EXPORT_REQUEST_COUNTER",
    "PAGE_RENDER_REQUEST_COUNTER",
    "RECIPE_RUN_REQUEST_COUNTER",
    "WORKER_JOB_DURATION_SECONDS",
    "WORKER_JOB_TOTAL",
    "CollectorRegistry",
    "instrument_api",
    "start_worker_metrics_server",
]

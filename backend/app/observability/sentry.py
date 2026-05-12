import structlog

logger = structlog.get_logger(__name__)


def configure_sentry(
    dsn: str | None,
    environment: str,
    service: str,
    traces_sample_rate: float = 0.0,
) -> bool:
    """Initialize the Sentry SDK if a DSN is configured.

    Returns True if Sentry was initialized, False otherwise. Importing or initializing
    Sentry without a DSN is a no-op so local development does not require credentials.
    """
    if not dsn:
        logger.info("sentry_disabled", service=service, environment=environment)
        return False

    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=dsn,
            environment=environment,
            traces_sample_rate=max(0.0, min(traces_sample_rate, 1.0)),
            send_default_pii=False,
        )
        sentry_sdk.set_tag("service", service)
        logger.info("sentry_initialized", service=service, environment=environment)
        return True
    except Exception as exc:
        logger.warning("sentry_initialization_failed", service=service, error=str(exc))
        return False


def flush_sentry(timeout: float = 2.0) -> None:
    try:
        import sentry_sdk

        sentry_sdk.flush(timeout=timeout)
    except Exception:
        pass


__all__ = ["configure_sentry", "flush_sentry"]

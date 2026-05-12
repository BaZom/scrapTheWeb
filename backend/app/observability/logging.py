import logging
import re
import sys
from typing import Any

import structlog
from structlog.types import EventDict, WrappedLogger

_SECRET_KEY_PATTERN = re.compile(
    r"(password|secret|token|authorization|api[_-]?key|jwt|cookie)",
    re.IGNORECASE,
)


def redact_secrets(
    _logger: WrappedLogger, _name: str, event_dict: EventDict
) -> EventDict:
    """Drop or redact keys whose name looks like a credential or bearer token.

    Keeps non-secret context (request_id, user_id, org_id, job_id, etc.) intact.
    """
    for key in list(event_dict.keys()):
        if isinstance(key, str) and _SECRET_KEY_PATTERN.search(key):
            event_dict[key] = "***"
    return event_dict


def configure_logging(log_level: str, service: str | None = None) -> None:
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        redact_secrets,
        structlog.processors.JSONRenderer(),
    ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )

    if service is not None:
        structlog.contextvars.bind_contextvars(service=service)

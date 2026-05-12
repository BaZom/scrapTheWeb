#!/usr/bin/env python3
"""Offline smoke checks for Slice 8 observability modules.

These run without the docker stack and verify that:
- the log redactor strips secret-shaped keys
- Sentry init returns False when no DSN is configured
- the worker metrics server soft-fails when the port is already in use
- the OpenTelemetry tracer can be obtained without an exporter configured

Run from the repo root:
    python3 scripts/smoke_observability_offline.py
"""
from __future__ import annotations

import socket
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
for candidate in (REPO_ROOT / "backend", REPO_ROOT):
    if (candidate / "app" / "observability").is_dir():
        sys.path.insert(0, str(candidate))
        break

from app.observability.logging import redact_secrets  # noqa: E402
from app.observability.metrics import start_worker_metrics_server  # noqa: E402
from app.observability.sentry import configure_sentry  # noqa: E402
from app.observability.tracing import (  # noqa: E402
    configure_worker_tracing,
    get_tracer,
)


def fail(message: str) -> None:
    print(f"smoke_observability_offline failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def assert_redact_secrets() -> None:
    event = {
        "event": "request_completed",
        "user_id": "abc-123",
        "password": "hunter2",
        "Authorization": "Bearer ya29.something",
        "api_key": "sk-test",
        "refresh_token": "opaque",
        "request_id": "abcdef",
    }
    redacted = redact_secrets(None, "info", dict(event))
    if redacted["user_id"] != "abc-123":
        fail("user_id should not be redacted")
    if redacted["request_id"] != "abcdef":
        fail("request_id should not be redacted")
    for key in ("password", "Authorization", "api_key", "refresh_token"):
        if redacted[key] != "***":
            fail(f"{key} was not redacted: {redacted[key]!r}")


def assert_sentry_disabled_without_dsn() -> None:
    initialized = configure_sentry(dsn=None, environment="local", service="api-test")
    if initialized:
        fail("Sentry should not initialize without a DSN")
    initialized_empty = configure_sentry(dsn="", environment="local", service="api-test")
    if initialized_empty:
        fail("Sentry should not initialize with empty DSN")


def assert_worker_metrics_soft_fail() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))
    sock.listen(1)
    port = sock.getsockname()[1]
    try:
        start_worker_metrics_server(port)
    finally:
        sock.close()


def assert_tracing_no_op() -> None:
    configure_worker_tracing(service="worker-test", otlp_endpoint=None, console=False)
    tracer = get_tracer("smoke")
    with tracer.start_as_current_span("smoke_span") as span:
        span.set_attribute("ok", True)


def main() -> None:
    assert_redact_secrets()
    assert_sentry_disabled_without_dsn()
    assert_worker_metrics_soft_fail()
    assert_tracing_no_op()
    print("slice8 observability offline smoke checks passed")


if __name__ == "__main__":
    main()

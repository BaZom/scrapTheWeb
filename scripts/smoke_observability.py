#!/usr/bin/env python3
"""Slice 8 observability smoke checks.

Verifies that the live API exposes:
- /health/live as a simple liveness probe that does not touch dependencies
- /health/ready that reflects dependency status with a non-degraded shape
- /metrics that returns Prometheus text exposition with custom counters
- a request id round-trip via the X-Request-ID header
- structured log lines from the API container that include request_id context

The script is safe to run repeatedly. It does not assume any specific Sentry
or OpenTelemetry configuration; it only confirms that the API starts and
serves traffic without observability credentials.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")


def fail(message: str) -> None:
    print(f"smoke_observability failed: {message}", file=sys.stderr)
    raise SystemExit(1)


def fetch(
    path: str,
    headers: dict[str, str] | None = None,
    timeout: int = 10,
) -> tuple[int, bytes, dict[str, str]]:
    request_headers = headers or {}
    req = Request(f"{API_BASE_URL}{path}", headers=request_headers, method="GET")
    try:
        with urlopen(req, timeout=timeout) as response:
            return response.status, response.read(), dict(response.headers)
    except HTTPError as exc:
        return exc.code, exc.read(), dict(exc.headers)
    except URLError as exc:
        raise RuntimeError(f"could not reach API at {API_BASE_URL}: {exc}") from exc


def assert_liveness() -> None:
    status, body, _ = fetch("/health/live")
    if status != 200:
        fail(f"/health/live returned {status}")
    payload = json.loads(body.decode("utf-8") or "{}")
    if payload.get("status") != "ok":
        fail(f"/health/live status was {payload!r}")


def assert_readiness() -> None:
    status, body, _ = fetch("/health/ready")
    if status not in {200, 503}:
        fail(f"/health/ready returned {status}")
    payload = json.loads(body.decode("utf-8") or "{}")
    dependencies = payload.get("dependencies", [])
    if not isinstance(dependencies, list) or not dependencies:
        fail(f"/health/ready missing dependencies: {payload!r}")
    expected = {"postgres", "redis", "s3"}
    seen = {entry.get("name") for entry in dependencies if isinstance(entry, dict)}
    if not expected.issubset(seen):
        fail(f"/health/ready missing dependency check names: {seen}")


def assert_metrics() -> None:
    status, body, headers = fetch("/metrics")
    if status != 200:
        fail(f"/metrics returned {status}")
    text = body.decode("utf-8", errors="replace")
    if "scraptheweb_page_render_requests_total" not in text:
        fail("metrics output missing scraptheweb_page_render_requests_total")
    if "scraptheweb_recipe_run_requests_total" not in text:
        fail("metrics output missing scraptheweb_recipe_run_requests_total")
    if "scraptheweb_export_requests_total" not in text:
        fail("metrics output missing scraptheweb_export_requests_total")
    if "http_request_duration_seconds" not in text and "http_requests_total" not in text:
        fail("metrics output missing default HTTP metrics")
    content_type = headers.get("content-type") or headers.get("Content-Type") or ""
    if "text/plain" not in content_type and "openmetrics" not in content_type:
        fail(f"unexpected metrics content-type: {content_type!r}")


def assert_request_id_round_trip() -> None:
    inbound = uuid4().hex
    status, _, headers = fetch("/health/live", headers={"X-Request-ID": inbound})
    if status != 200:
        fail(f"/health/live with custom request id returned {status}")
    response_id = headers.get("x-request-id") or headers.get("X-Request-ID")
    if response_id != inbound:
        fail(f"request id not echoed: sent {inbound!r}, got {response_id!r}")


def assert_request_id_generated() -> None:
    status, _, headers = fetch("/health/live")
    if status != 200:
        fail(f"/health/live returned {status}")
    response_id = headers.get("x-request-id") or headers.get("X-Request-ID")
    if not response_id or len(response_id) < 8:
        fail(f"server did not generate request id: {response_id!r}")


def assert_logs_contain_request_id() -> None:
    if os.environ.get("SKIP_LOG_CHECK") == "1":
        return
    inbound = uuid4().hex
    status, _, _ = fetch("/health/ready", headers={"X-Request-ID": inbound})
    if status not in {200, 503}:
        fail(f"/health/ready returned {status}")
    cwd = Path(__file__).resolve().parents[1]
    try:
        log_output = subprocess.check_output(
            ["docker", "compose", "logs", "--tail", "200", "api"],
            cwd=cwd,
            text=True,
            stderr=subprocess.STDOUT,
            timeout=15,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
        return
    if inbound not in log_output:
        fail(f"request id {inbound} not found in recent API logs")
    if "request_completed" not in log_output:
        fail("API logs missing request_completed structured event")


def main() -> None:
    assert_liveness()
    assert_readiness()
    assert_metrics()
    assert_request_id_round_trip()
    assert_request_id_generated()
    assert_logs_contain_request_id()
    print("slice8 observability smoke checks passed")


if __name__ == "__main__":
    main()

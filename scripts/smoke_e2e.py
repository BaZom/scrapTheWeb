#!/usr/bin/env python3
"""End-to-end smoke for the books.toscrape demo flow.

Walks through the full Slice 0-9 happy path against a running stack:
register, page-session render, preview, recipe save, run, export (CSV + JSON),
and API key usage. Skips when ``SKIP_LIVE_E2E_SMOKE`` is set.

Usage:
    API_BASE_URL=http://localhost:8000 python3 scripts/smoke_e2e.py
"""
from __future__ import annotations

import json
import os
import sys
import time
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")
SKIP = os.environ.get("SKIP_LIVE_E2E_SMOKE") == "1"


def request(
    method: str,
    path: str,
    body: dict[str, object] | None = None,
    token: str | None = None,
    api_key: str | None = None,
    timeout: int = 60,
    raw_response: bool = False,
):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if api_key:
        headers["X-API-Key"] = api_key
    req = Request(f"{API_BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as response:
            payload_bytes = response.read()
            if raw_response:
                return response.status, payload_bytes, response.headers
            payload = json.loads(payload_bytes.decode("utf-8") or "{}")
            return response.status, payload
    except HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(body or "{}")
        except json.JSONDecodeError:
            return exc.code, body
    except URLError as exc:
        raise RuntimeError(f"could not reach API at {API_BASE_URL}: {exc}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        print(f"smoke_e2e failed: {message}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    if SKIP:
        print("smoke_e2e skipped (SKIP_LIVE_E2E_SMOKE=1)")
        return

    started = time.monotonic()
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    email = f"slice9-e2e-{timestamp}-{uuid4().hex[:6]}@example.com"
    password = "correct horse battery staple"

    status, registered = request("POST", "/auth/register", {"email": email, "password": password})
    require(status == 201, f"register: {status} {registered}")
    token = registered["access_token"]

    status, session = request(
        "POST",
        "/api/page-sessions",
        {"url": "https://books.toscrape.com/"},
        token=token,
    )
    require(status == 201, f"page-session create: {status} {session}")
    require(session["jobStatus"] in {"completed", "running", "queued"}, "job status missing")
    session_id = session["sessionId"]

    fields = [
        {"name": "title", "selector": "h3 > a", "extract": "text"},
        {"name": "detail_url", "selector": "h3 > a", "extract": "href"},
        {"name": "price", "selector": "p.price_color", "extract": "text"},
    ]

    preview_status: int = 0
    preview: dict[str, object] = {}
    for _ in range(15):
        preview_status, preview = request(
            "POST",
            f"/api/page-sessions/{session_id}/preview",
            {"containerSelector": "article.product_pod", "fields": fields},
            token=token,
        )
        if preview_status == 200:
            break
        time.sleep(2)
    require(preview_status == 200, f"preview returned {preview_status}: {preview}")
    require(preview["rowCount"] == 20, f"preview rowCount {preview}")

    status, recipe = request(
        "POST",
        "/api/recipes",
        {
            "name": "Books page 1 (e2e)",
            "url": "https://books.toscrape.com/",
            "containerSelector": "article.product_pod",
            "fields": fields,
            "pageType": "listing",
        },
        token=token,
    )
    require(status == 201, f"recipe save: {status} {recipe}")
    recipe_id = recipe["id"]

    status, run_create = request("POST", f"/api/recipes/{recipe_id}/runs", token=token)
    require(status == 200, f"run create: {status} {run_create}")
    run_id = run_create["runId"]

    run: dict[str, object] = {}
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        status, run = request("GET", f"/api/runs/{run_id}", token=token)
        require(status == 200, f"run read: {status} {run}")
        if run.get("status") in {"completed", "failed"}:
            break
        time.sleep(2)
    require(run.get("status") == "completed", f"run did not complete: {run}")
    require(run.get("totalRecords") == 20, f"unexpected record count {run}")

    # API key access on a read endpoint
    status, key = request("POST", "/me/api-keys", {"name": "e2e"}, token=token)
    require(status == 201, f"api-key create: {status} {key}")
    raw_key = key["api_key"]

    status, run_via_api_key = request("GET", f"/api/runs/{run_id}", api_key=raw_key)
    require(status == 200, f"run read via api key: {status} {run_via_api_key}")
    require(run_via_api_key["totalRecords"] == 20, "API-key read mismatch")

    # CSV export via API key
    status, csv_body, headers = request(
        "GET", f"/api/runs/{run_id}/export.csv", api_key=raw_key, raw_response=True
    )
    require(status == 200, f"csv export: {status}")
    require(
        b"record_key" in csv_body and b"title" in csv_body,
        "csv missing expected columns",
    )

    # JSON export via JWT
    status, json_body, _ = request(
        "GET", f"/api/runs/{run_id}/export.json", token=token, raw_response=True
    )
    require(status == 200, f"json export: {status}")
    parsed = json.loads(json_body)
    require(len(parsed["records"]) == 20, f"json export records: {len(parsed['records'])}")

    print(f"slice9 e2e smoke checks passed in {round(time.monotonic() - started, 1)}s")


if __name__ == "__main__":
    main()

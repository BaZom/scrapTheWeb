#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")


def request(
    method: str,
    path: str,
    body: dict[str, object] | None = None,
    token: str | None = None,
    timeout: int = 45,
) -> tuple[int, dict[str, object]]:
    status, raw_body, _ = raw_request(method, path, body, token, timeout)
    payload = json.loads(raw_body.decode("utf-8") or "{}")
    return status, payload


def raw_request(
    method: str,
    path: str,
    body: dict[str, object] | None = None,
    token: str | None = None,
    timeout: int = 45,
) -> tuple[int, bytes, dict[str, str]]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{API_BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as response:
            return response.status, response.read(), dict(response.headers)
    except HTTPError as exc:
        return exc.code, exc.read(), dict(exc.headers)
    except URLError as exc:
        raise RuntimeError(f"could not reach API at {API_BASE_URL}: {exc}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        print(f"smoke_limits failed: {message}", file=sys.stderr)
        raise SystemExit(1)


def recipe_payload() -> dict[str, object]:
    return {
        "name": "Books page 1",
        "url": "https://books.toscrape.com/",
        "containerSelector": "article.product_pod",
        "fields": [
            {"name": "title", "selector": "h3 > a", "extract": "text"},
            {"name": "detail_url", "selector": "h3 > a", "extract": "href"},
            {"name": "price", "selector": "p.price_color", "extract": "text"},
        ],
        "pageType": "listing",
    }


def register_user(prefix: str) -> tuple[str, str]:
    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    status, auth = request(
        "POST",
        "/auth/register",
        {
            "email": f"{prefix}-{timestamp}@example.com",
            "password": "correct horse battery staple",
        },
    )
    require(status == 201, f"register returned {status}: {auth}")
    organization = auth.get("organization")
    require(isinstance(organization, dict), f"missing organization: {auth}")
    return str(auth["access_token"]), str(organization["id"])


def create_completed_run(recipe_id: str, token: str) -> dict[str, object]:
    status, created = request("POST", f"/api/recipes/{recipe_id}/runs", token=token)
    require(status == 200, f"run create returned {status}: {created}")
    run_id = str(created["runId"])

    deadline = time.monotonic() + 70
    run: dict[str, object] = {}
    while time.monotonic() < deadline:
        status, run = request("GET", f"/api/runs/{run_id}", token=token)
        require(status == 200, f"run read returned {status}: {run}")
        if run.get("status") in {"completed", "failed"}:
            break
        time.sleep(2)
    require(run.get("status") == "completed", f"run did not complete: {run}")
    return run


def counter_values(organization_id: str) -> dict[str, int]:
    query = (
        "select metric || '=' || value from usage_counters "
        f"where organization_id = '{organization_id}' order by metric;"
    )
    command = [
        "docker",
        "compose",
        "exec",
        "-T",
        "db",
        "psql",
        "-U",
        "scraptheweb",
        "-d",
        "scraptheweb",
        "-At",
        "-c",
        query,
    ]
    output = subprocess.check_output(
        command, text=True, cwd=Path(__file__).resolve().parents[1]
    )
    values: dict[str, int] = {}
    for line in output.splitlines():
        if "=" not in line:
            continue
        metric, value = line.split("=", 1)
        values[metric] = int(value)
    return values


def assert_unauthenticated_unchanged() -> None:
    missing_id = uuid4()
    status, _ = request("POST", "/api/page-sessions", {"url": "https://books.toscrape.com/"})
    require(status == 401, f"unauthenticated render returned {status}")
    status, _ = request("POST", f"/api/recipes/{missing_id}/runs")
    require(status == 401, f"unauthenticated run returned {status}")
    status, _, _ = raw_request("GET", f"/api/runs/{missing_id}/export.csv")
    require(status == 401, f"unauthenticated export returned {status}")


def assert_usage_counters_increment() -> None:
    token, organization_id = register_user("slice7-counters")
    status, rendered = request(
        "POST",
        "/api/page-sessions",
        {"url": "https://books.toscrape.com/"},
        token=token,
    )
    require(status == 201, f"render returned {status}: {rendered}")

    status, recipe = request("POST", "/api/recipes", recipe_payload(), token=token)
    require(status == 201, f"recipe save returned {status}: {recipe}")
    run = create_completed_run(str(recipe["id"]), token)

    status, _, _ = raw_request("GET", f"/api/runs/{run['id']}/export.csv", token=token)
    require(status == 200, f"CSV export returned {status}")

    if os.environ.get("SKIP_DB_COUNTER_CHECK") == "1":
        return

    values = counter_values(organization_id)
    require(values.get("page_render_requests", 0) >= 1, f"missing render counter: {values}")
    require(values.get("recipe_run_requests", 0) >= 1, f"missing run counter: {values}")
    require(values.get("export_requests", 0) >= 1, f"missing export counter: {values}")


def assert_low_limit_failure(expected: str) -> None:
    token, _ = register_user(f"slice7-{expected}")
    body = {"url": "https://books.toscrape.com/"}
    status, first = request("POST", "/api/page-sessions", body, token=token)
    require(status == 201, f"first render returned {status}: {first}")
    status, second = request("POST", "/api/page-sessions", body, token=token)
    require(status == 429, f"second render returned {status}: {second}")
    detail = str(second.get("detail", "")).lower()
    require(expected in detail, f"expected {expected} 429 detail, got: {second}")


def main() -> None:
    if os.environ.get("SKIP_LIVE_LIMIT_SMOKE") == "1":
        print("slice7 limits static smoke checks passed")
        return
    assert_unauthenticated_unchanged()
    if os.environ.get("SLICE7_EXPECT_LIMIT_FAILURE") in {"rate", "quota"}:
        assert_low_limit_failure(str(os.environ["SLICE7_EXPECT_LIMIT_FAILURE"]))
    elif os.environ.get("SKIP_LIVE_LIMIT_COUNTERS") != "1":
        assert_usage_counters_increment()
    print("slice7 limits smoke checks passed")


if __name__ == "__main__":
    main()

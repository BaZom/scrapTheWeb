#!/usr/bin/env python3
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.change_detector import detect_changes  # noqa: E402

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
        print(f"smoke_export_diff failed: {message}", file=sys.stderr)
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


def run_unit_check() -> None:
    previous = {
        "a": {"title": "Old", "price": "£1.00"},
        "b": {"title": "Same", "price": "£2.00"},
        "c": {"title": "Removed", "price": "£3.00"},
    }
    current = {
        "a": {"title": "New", "price": "£1.00"},
        "b": {"title": "Same", "price": "£2.00"},
        "d": {"title": "Added", "price": "£4.00"},
    }
    changes = detect_changes(previous, current)
    summary = [(change["change_type"], change["record_key"]) for change in changes]
    require(summary == [("new", "d"), ("changed", "a"), ("removed", "c")], str(changes))


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


def run_live_check() -> None:
    missing_run = uuid4()
    status, _, _ = raw_request("GET", f"/api/runs/{missing_run}/export.csv")
    require(status == 401, f"unauthenticated CSV export returned {status}")
    status, _, _ = raw_request("GET", f"/api/runs/{missing_run}/export.json")
    require(status == 401, f"unauthenticated JSON export returned {status}")

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    password = "correct horse battery staple"
    status, owner = request(
        "POST",
        "/auth/register",
        {"email": f"slice6-owner-{timestamp}@example.com", "password": password},
    )
    require(status == 201, f"owner register returned {status}: {owner}")
    owner_token = str(owner["access_token"])

    status, recipe = request("POST", "/api/recipes", recipe_payload(), token=owner_token)
    require(status == 201, f"recipe save returned {status}: {recipe}")
    recipe_id = str(recipe["id"])

    first_run = create_completed_run(recipe_id, owner_token)
    first_run_id = str(first_run["id"])

    status, csv_body, csv_headers = raw_request(
        "GET", f"/api/runs/{first_run_id}/export.csv", token=owner_token
    )
    require(status == 200, f"CSV export returned {status}: {csv_body[:120]}")
    csv_text = csv_body.decode("utf-8")
    require("record_key,title,detail_url,price" in csv_text.splitlines()[0], csv_text[:120])
    require("catalogue/a-light-in-the-attic_1000/index.html" in csv_text, "expected book URL missing from CSV")
    require("£51.77" in csv_text, "expected book price missing from CSV")
    require("text/csv" in csv_headers.get("content-type", ""), str(csv_headers))

    status, json_body, json_headers = raw_request(
        "GET", f"/api/runs/{first_run_id}/export.json", token=owner_token
    )
    require(status == 200, f"JSON export returned {status}: {json_body[:120]}")
    exported = json.loads(json_body.decode("utf-8"))
    records = exported.get("records")
    require(isinstance(records, list) and len(records) == 20, f"unexpected JSON export {exported}")
    require("application/json" in json_headers.get("content-type", ""), str(json_headers))

    status, intruder = request(
        "POST",
        "/auth/register",
        {"email": f"slice6-intruder-{timestamp}@example.com", "password": password},
    )
    require(status == 201, f"intruder register returned {status}: {intruder}")
    intruder_token = str(intruder["access_token"])

    status, _ = request("GET", f"/api/runs/{first_run_id}", token=intruder_token)
    require(status == 404, f"wrong-org run detail returned {status}")
    status, _, _ = raw_request(
        "GET", f"/api/runs/{first_run_id}/export.csv", token=intruder_token
    )
    require(status == 404, f"wrong-org CSV export returned {status}")

    second_run = create_completed_run(recipe_id, owner_token)
    changes = second_run.get("changes")
    require(isinstance(changes, dict), f"missing changes in run detail {second_run}")
    require(set(changes) == {"new", "changed", "removed"}, f"unexpected changes {changes}")


def main() -> None:
    run_unit_check()
    if os.environ.get("SKIP_LIVE_EXPORT_DIFF_SMOKE") == "1":
        print("slice6 export/diff unit smoke checks passed")
        return
    started = time.monotonic()
    run_live_check()
    print(f"slice6 export/diff smoke checks passed in {round(time.monotonic() - started, 1)}s")


if __name__ == "__main__":
    main()

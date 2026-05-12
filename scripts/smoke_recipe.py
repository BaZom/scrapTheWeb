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

from app.recipe_runner import extract_preview_rows  # noqa: E402

API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")


def request(
    method: str,
    path: str,
    body: dict[str, object] | None = None,
    token: str | None = None,
    timeout: int = 45,
) -> tuple[int, dict[str, object]]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{API_BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
            return response.status, payload
    except HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8") or "{}")
        return exc.code, payload
    except URLError as exc:
        raise RuntimeError(f"could not reach API at {API_BASE_URL}: {exc}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        print(f"smoke_recipe failed: {message}", file=sys.stderr)
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
    html = """
    <html><body>
      <article class="product_pod">
        <h3><a href="catalogue/a/index.html">A Book</a></h3>
        <p class="price_color">£10.00</p>
      </article>
    </body></html>
    """
    rows = extract_preview_rows(
        html,
        "article.product_pod",
        recipe_payload()["fields"],  # type: ignore[arg-type]
    )
    require(rows == [{"title": "A Book", "detail_url": "catalogue/a/index.html", "price": "£10.00"}], f"unexpected rows {rows}")


def run_live_check() -> None:
    missing_recipe = uuid4()
    status, _ = request("POST", "/api/recipes", recipe_payload())
    require(status == 401, f"unauthenticated recipe save returned {status}")
    status, _ = request("POST", f"/api/recipes/{missing_recipe}/runs")
    require(status == 401, f"unauthenticated recipe run returned {status}")

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    password = "correct horse battery staple"
    status, owner = request(
        "POST",
        "/auth/register",
        {"email": f"slice5-owner-{timestamp}@example.com", "password": password},
    )
    require(status == 201, f"owner register returned {status}: {owner}")
    owner_token = str(owner["access_token"])

    status, recipe = request("POST", "/api/recipes", recipe_payload(), token=owner_token)
    require(status == 201, f"recipe save returned {status}: {recipe}")
    require(recipe.get("name") == "Books page 1", f"unexpected recipe {recipe}")
    recipe_id = str(recipe["id"])

    status, intruder = request(
        "POST",
        "/auth/register",
        {"email": f"slice5-intruder-{timestamp}@example.com", "password": password},
    )
    require(status == 201, f"intruder register returned {status}")
    intruder_token = str(intruder["access_token"])

    status, _ = request("GET", f"/api/recipes/{recipe_id}", token=intruder_token)
    require(status == 404, f"wrong-org recipe read returned {status}")
    status, _ = request("POST", f"/api/recipes/{recipe_id}/runs", token=intruder_token)
    require(status == 404, f"wrong-org recipe run returned {status}")

    status, created_run = request("POST", f"/api/recipes/{recipe_id}/runs", token=owner_token)
    require(status == 200, f"run create returned {status}: {created_run}")
    run_id = str(created_run["runId"])

    run: dict[str, object] = {}
    deadline = time.monotonic() + 70
    while time.monotonic() < deadline:
        status, run = request("GET", f"/api/runs/{run_id}", token=owner_token)
        require(status == 200, f"run read returned {status}: {run}")
        if run.get("status") in {"completed", "failed"}:
            break
        time.sleep(2)

    require(run.get("status") == "completed", f"run did not complete: {run}")
    require(run.get("totalRecords") == 20, f"unexpected record count {run}")
    records = run.get("records")
    require(isinstance(records, list) and len(records) == 20, f"unexpected records {run}")
    first = records[0]
    require(isinstance(first, dict), f"unexpected first record {first}")
    data = first.get("data")
    require(isinstance(data, dict), f"unexpected first data {first}")
    require(bool(data.get("title")), f"missing title {data}")
    require(str(data.get("detail_url", "")).endswith("index.html"), f"missing detail url {data}")


def main() -> None:
    run_unit_check()
    if os.environ.get("SKIP_LIVE_RECIPE_SMOKE") == "1":
        print("slice5 recipe unit smoke checks passed")
        return
    started = time.monotonic()
    run_live_check()
    print(f"slice5 recipe smoke checks passed in {round(time.monotonic() - started, 1)}s")


if __name__ == "__main__":
    main()

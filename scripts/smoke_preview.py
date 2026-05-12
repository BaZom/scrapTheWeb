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
        print(f"smoke_preview failed: {message}", file=sys.stderr)
        raise SystemExit(1)


def known_books_html() -> str:
    cards = []
    for index in range(1, 21):
        cards.append(
            f"""
            <article class="product_pod">
              <div class="image_container">
                <a href="catalogue/book-{index}/index.html">
                  <img src="media/cache/book-{index}.jpg" alt="Book {index}">
                </a>
              </div>
              <h3><a href="catalogue/book-{index}/index.html" title="Book {index}">Book {index}</a></h3>
              <p class="price_color">£{index}.00</p>
            </article>
            """
        )
    return f"<html><body><section>{''.join(cards)}</section></body></html>"


def preview_payload() -> dict[str, object]:
    return {
        "containerSelector": "article.product_pod",
        "fields": [
            {"name": "title", "selector": "h3 > a", "extract": "text"},
            {"name": "detail_url", "selector": "h3 > a", "extract": "href"},
            {"name": "price", "selector": "p.price_color", "extract": "text"},
        ],
    }


def run_unit_check() -> None:
    rows = extract_preview_rows(
        known_books_html(),
        "article.product_pod",
        preview_payload()["fields"],  # type: ignore[arg-type]
    )
    require(len(rows) == 20, f"unexpected row count {len(rows)}")
    require(rows[0]["title"] == "Book 1", f"unexpected title {rows[0]}")
    require(
        rows[0]["detail_url"] == "catalogue/book-1/index.html",
        f"unexpected href {rows[0]}",
    )
    require(rows[0]["price"] == "£1.00", f"unexpected price {rows[0]}")


def run_live_check() -> None:
    missing_session = uuid4()
    status, _ = request("POST", f"/api/page-sessions/{missing_session}/preview", preview_payload())
    require(status == 401, f"unauthenticated preview returned {status}")

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    password = "correct horse battery staple"
    status, owner = request(
        "POST",
        "/auth/register",
        {"email": f"slice4-owner-{timestamp}@example.com", "password": password},
    )
    require(status == 201, f"owner register returned {status}")
    owner_token = str(owner["access_token"])

    status, rendered = request(
        "POST",
        "/api/page-sessions",
        {"url": "https://books.toscrape.com/"},
        token=owner_token,
    )
    require(status == 201, f"render returned {status}: {rendered}")
    require(rendered.get("jobStatus") == "completed", "render did not complete during preview smoke")
    session_id = str(rendered["sessionId"])

    status, intruder = request(
        "POST",
        "/auth/register",
        {"email": f"slice4-intruder-{timestamp}@example.com", "password": password},
    )
    require(status == 201, f"intruder register returned {status}")
    status, _ = request(
        "POST",
        f"/api/page-sessions/{session_id}/preview",
        preview_payload(),
        token=str(intruder["access_token"]),
    )
    require(status == 404, f"wrong-org preview returned {status}")

    status, preview = request(
        "POST",
        f"/api/page-sessions/{session_id}/preview",
        preview_payload(),
        token=owner_token,
    )
    require(status == 200, f"preview returned {status}: {preview}")
    rows = preview.get("rows")
    require(isinstance(rows, list) and len(rows) == 20, f"unexpected rows {preview}")
    first = rows[0]
    require(isinstance(first, dict), f"unexpected first row {first}")
    require(bool(first.get("title")), f"missing title {first}")
    require(str(first.get("detail_url", "")).endswith("index.html"), f"missing href {first}")


def main() -> None:
    run_unit_check()
    if os.environ.get("SKIP_LIVE_PREVIEW_SMOKE") == "1":
        print("slice4 preview unit smoke checks passed")
        return
    started = time.monotonic()
    run_live_check()
    print(f"slice4 preview smoke checks passed in {round(time.monotonic() - started, 1)}s")


if __name__ == "__main__":
    main()

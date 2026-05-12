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

from app.selector_generator import generate_selector  # noqa: E402

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
        print(f"smoke_selector failed: {message}", file=sys.stderr)
        raise SystemExit(1)


def known_books_dom() -> list[dict[str, object]]:
    nodes: list[dict[str, object]] = [
        {
            "nodeId": "node-main",
            "tag": "ol",
            "text": "",
            "attrs": {"class": "row"},
            "classes": ["row"],
            "parentNodeId": None,
            "nthOfType": 1,
            "x": 0,
            "y": 0,
            "width": 1200,
            "height": 800,
        }
    ]
    for index in range(1, 21):
        nodes.append(
            {
                "nodeId": f"node-book-{index}",
                "tag": "article",
                "text": f"Book {index}",
                "attrs": {"class": "product_pod"},
                "classes": ["product_pod"],
                "parentNodeId": "node-main",
                "nthOfType": index,
                "x": 10 + index,
                "y": 20 + index,
                "width": 220,
                "height": 320,
            }
        )
        nodes.extend(
            [
                {
                    "nodeId": f"node-book-{index}-image-link",
                    "tag": "a",
                    "text": "",
                    "attrs": {},
                    "classes": [],
                    "parentNodeId": f"node-book-{index}",
                    "nthOfType": 1,
                    "x": 20 + index,
                    "y": 30 + index,
                    "width": 180,
                    "height": 200,
                },
                {
                    "nodeId": f"node-book-{index}-heading",
                    "tag": "h3",
                    "text": f"Book {index}",
                    "attrs": {},
                    "classes": [],
                    "parentNodeId": f"node-book-{index}",
                    "nthOfType": 1,
                    "x": 20 + index,
                    "y": 240 + index,
                    "width": 180,
                    "height": 24,
                },
                {
                    "nodeId": f"node-book-{index}-title-link",
                    "tag": "a",
                    "text": f"Book {index}",
                    "attrs": {},
                    "classes": [],
                    "parentNodeId": f"node-book-{index}-heading",
                    "nthOfType": 1,
                    "x": 20 + index,
                    "y": 240 + index,
                    "width": 180,
                    "height": 24,
                },
                {
                    "nodeId": f"node-book-{index}-price",
                    "tag": "p",
                    "text": f"£{index}.00",
                    "attrs": {"class": "price_color"},
                    "classes": ["price_color"],
                    "parentNodeId": f"node-book-{index}",
                    "nthOfType": 1,
                    "x": 20 + index,
                    "y": 280 + index,
                    "width": 80,
                    "height": 24,
                },
            ]
        )
    return nodes


def run_unit_check() -> None:
    selector = generate_selector(known_books_dom(), "node-book-1", "container")
    require(
        selector["selector"] == "article.product_pod",
        f"unexpected selector {selector}",
    )
    require(selector["matchCount"] == 20, f"unexpected match count {selector}")
    title_selector = generate_selector(
        known_books_dom(),
        "node-book-1-title-link",
        "node",
        "article.product_pod",
    )
    require(
        title_selector["selector"] == "h3 > a",
        f"unexpected title selector {title_selector}",
    )


def run_live_check() -> None:
    missing_session = uuid4()
    status, _ = request(
        "POST",
        f"/api/page-sessions/{missing_session}/selector",
        {"nodeId": "node-1", "mode": "container"},
    )
    require(status == 401, f"unauthenticated selector returned {status}")

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    password = "correct horse battery staple"
    status, owner = request(
        "POST",
        "/auth/register",
        {"email": f"slice3-owner-{timestamp}@example.com", "password": password},
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
    require(rendered.get("jobStatus") == "completed", "render did not complete during selector smoke")
    session_id = str(rendered["sessionId"])
    nodes = rendered.get("domNodes", [])
    require(isinstance(nodes, list) and len(nodes) > 0, "render returned no DOM nodes")
    article = next(
        (
            node
            for node in nodes
            if isinstance(node, dict)
            and node.get("tag") == "article"
            and "product_pod" in node.get("classes", [])
        ),
        None,
    )
    require(article is not None, "books render did not include a product_pod article")

    status, intruder = request(
        "POST",
        "/auth/register",
        {"email": f"slice3-intruder-{timestamp}@example.com", "password": password},
    )
    require(status == 201, f"intruder register returned {status}")
    status, _ = request(
        "POST",
        f"/api/page-sessions/{session_id}/selector",
        {"nodeId": str(article["nodeId"]), "mode": "container"},
        token=str(intruder["access_token"]),
    )
    require(status == 404, f"wrong-org selector returned {status}")

    status, selector = request(
        "POST",
        f"/api/page-sessions/{session_id}/selector",
        {"nodeId": str(article["nodeId"]), "mode": "container"},
        token=owner_token,
    )
    require(status == 200, f"selector returned {status}: {selector}")
    require(selector.get("selector") == "article.product_pod", f"unexpected selector {selector}")
    require(selector.get("matchCount") == 20, f"unexpected match count {selector}")


def main() -> None:
    run_unit_check()
    if os.environ.get("SKIP_LIVE_SELECTOR_SMOKE") == "1":
        print("slice3 selector unit smoke checks passed")
        return
    started = time.monotonic()
    run_live_check()
    print(f"slice3 selector smoke checks passed in {round(time.monotonic() - started, 1)}s")


if __name__ == "__main__":
    main()

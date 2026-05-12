#!/usr/bin/env python3
import json
import os
import sys
from datetime import datetime, UTC
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


API_BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000").rstrip("/")


def request(
    method: str,
    path: str,
    body: dict[str, object] | None = None,
    token: str | None = None,
) -> tuple[int, dict[str, object]]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{API_BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=40) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
            return response.status, payload
    except HTTPError as exc:
        payload = json.loads(exc.read().decode("utf-8") or "{}")
        return exc.code, payload
    except URLError as exc:
        raise RuntimeError(f"could not reach API at {API_BASE_URL}: {exc}") from exc


def require(condition: bool, message: str) -> None:
    if not condition:
        print(f"smoke_render failed: {message}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    status, _ = request("POST", "/api/page-sessions", {"url": "https://books.toscrape.com/"})
    require(status == 401, f"unauthenticated render returned {status}")

    timestamp = datetime.now(UTC).strftime("%Y%m%d%H%M%S%f")
    email = f"slice2-{timestamp}@example.com"
    password = "correct horse battery staple"
    status, registered = request("POST", "/auth/register", {"email": email, "password": password})
    require(status == 201, f"register returned {status}")
    token = str(registered["access_token"])

    status, _ = request(
        "POST", "/api/page-sessions", {"url": "http://127.0.0.1:8000/"}, token=token
    )
    require(status == 400, f"SSRF guard returned {status}")

    status, rendered = request(
        "POST", "/api/page-sessions", {"url": "https://books.toscrape.com/"}, token=token
    )
    require(status == 201, f"render returned {status}: {rendered}")
    require(bool(rendered.get("sessionId")), "render response missing sessionId")
    require(rendered.get("jobStatus") in {"queued", "running", "completed"}, "unexpected jobStatus")
    if rendered.get("jobStatus") == "completed":
        require(bool(rendered.get("screenshotUrl")), "completed render missing screenshotUrl")
        require(bool(rendered.get("title")), "completed render missing title")
        require(len(rendered.get("domNodes", [])) > 0, "completed render missing domNodes")

    print("slice2 render smoke checks passed")


if __name__ == "__main__":
    main()

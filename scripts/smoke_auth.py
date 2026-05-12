#!/usr/bin/env python3
import json
import os
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")


def request(
    method: str, path: str, body: dict | None = None, token: str | None = None
) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"

    try:
        api_request = Request(
            f"{BASE_URL}{path}", data=data, headers=headers, method=method
        )
        with urlopen(api_request, timeout=5) as response:
            payload = response.read().decode("utf-8")
            return response.status, json.loads(payload) if payload else {}
    except HTTPError as exc:
        payload = exc.read().decode("utf-8")
        return exc.code, json.loads(payload) if payload else {}


def require(condition: bool, message: str) -> None:
    if not condition:
        print(f"smoke_auth failed: {message}", file=sys.stderr)
        raise SystemExit(1)


def main() -> None:
    email = f"slice1-{int(time.time())}-{uuid4().hex[:8]}@example.com"
    password = "slice1-password"

    status, registered = request("POST", "/auth/register", {"email": email, "password": password})
    require(status == 201, f"register returned {status}: {registered}")
    require(registered["user"]["email"] == email, "register response includes wrong user")
    require(
        registered["organization"]["role"] == "owner",
        "register did not create owner membership",
    )

    status, dashboard = request("GET", "/me/dashboard", token=registered["access_token"])
    require(status == 200, f"dashboard returned {status}: {dashboard}")
    require(len(dashboard["organizations"]) == 1, "dashboard did not include one organization")

    wrong_org = uuid4()
    status, _ = request("GET", f"/orgs/{wrong_org}/member-check", token=registered["access_token"])
    require(status == 403, f"wrong org check returned {status}")

    status, refreshed = request(
        "POST", "/auth/refresh", {"refresh_token": registered["refresh_token"]}
    )
    require(status == 200, f"refresh returned {status}: {refreshed}")
    require(
        refreshed["refresh_token"] != registered["refresh_token"],
        "refresh token was not rotated",
    )

    status, _ = request("POST", "/auth/refresh", {"refresh_token": registered["refresh_token"]})
    require(status == 401, f"old refresh token returned {status}")

    status, logged_in = request("POST", "/auth/login", {"email": email, "password": password})
    require(status == 200, f"login returned {status}: {logged_in}")

    status, _ = request("POST", "/auth/logout", {"refresh_token": logged_in["refresh_token"]})
    require(status == 200, f"logout returned {status}")
    status, _ = request("POST", "/auth/refresh", {"refresh_token": logged_in["refresh_token"]})
    require(status == 401, f"logged-out refresh token returned {status}")

    print("slice1 auth smoke checks passed")


if __name__ == "__main__":
    main()

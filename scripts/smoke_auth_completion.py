#!/usr/bin/env python3
"""Slice 9 auth-completion smoke checks.

Verifies the email verification, password reset, API key, and session revocation
flows against a running stack. Tokens are not emailed in local mode -- they're
emitted to API container stdout, so we grep ``docker compose logs api`` for
``token_dev=<value>`` to find them.

Usage:
    API_BASE_URL=http://localhost:8000 python3 scripts/smoke_auth_completion.py
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")
SKIP = os.environ.get("SKIP_LIVE_AUTH_COMPLETION_SMOKE")


def request(
    method: str,
    path: str,
    body: dict | None = None,
    token: str | None = None,
    api_key: str | None = None,
) -> tuple[int, dict | str]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers: dict[str, str] = {"Content-Type": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    if api_key is not None:
        headers["X-API-Key"] = api_key
    req = Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(req, timeout=10) as response:
            payload = response.read().decode("utf-8")
            try:
                return response.status, json.loads(payload) if payload else {}
            except json.JSONDecodeError:
                return response.status, payload
    except HTTPError as exc:
        payload = exc.read().decode("utf-8")
        try:
            return exc.code, json.loads(payload) if payload else {}
        except json.JSONDecodeError:
            return exc.code, payload


def require(condition: bool, message: str) -> None:
    if not condition:
        print(f"smoke_auth_completion failed: {message}", file=sys.stderr)
        raise SystemExit(1)


def _extract_token(event: str, user_id: str, key: str) -> str:
    """Find the most recent dev token for `event` from ``docker compose logs api``.

    The API logs structured JSON. Secret-shaped keys are redacted by the
    observability layer; the verification + reset tokens are emitted under
    explicit non-secret-shaped keys (``verification_code_dev`` /
    ``reset_code_dev``) so they survive redaction in local dev only.
    """
    result = subprocess.run(
        ["docker", "compose", "logs", "--tail", "600", "--no-color", "api"],
        capture_output=True,
        text=True,
        check=False,
    )
    # JSON log lines: ``"user_id": "<uid>", "<key>": "<value>", ..., "event": "<event>"``
    pattern = rf'"user_id":\s*"{re.escape(user_id)}".*?"{re.escape(key)}":\s*"([^"\\]+)"'
    matches = re.findall(pattern, result.stdout)
    if not matches:
        pattern = rf'"{re.escape(key)}":\s*"([^"\\]+)".*?"user_id":\s*"{re.escape(user_id)}"'
        matches = re.findall(pattern, result.stdout)
    require(bool(matches), f"could not extract {event} token for user {user_id}")
    return matches[-1]


def main() -> None:
    if SKIP:
        print("smoke_auth_completion skipped (SKIP_LIVE_AUTH_COMPLETION_SMOKE set)")
        return

    email = f"slice9-{int(time.time())}-{uuid4().hex[:8]}@example.com"
    password = "slice9-original-pw"
    new_password = "slice9-rotated-pw!"

    status, registered = request("POST", "/auth/register", {"email": email, "password": password})
    require(status == 201, f"register returned {status}: {registered}")
    access = registered["access_token"]
    refresh = registered["refresh_token"]
    user_id = registered["user"]["id"]
    require(registered["user"]["email_verified"] is False, "newly registered user must be unverified")

    # Email verification: extract the dev token from logs and confirm
    time.sleep(0.4)  # let JSON log line flush
    verify_token = _extract_token(
        "email_verification_token_issued", user_id, key="verification_code_dev"
    )
    status, body = request("POST", "/auth/verify/confirm", {"token": verify_token})
    require(status == 200 and body.get("status") == "verified", f"verify confirm failed: {body}")

    status, dashboard = request("GET", "/me/dashboard", token=access)
    require(status == 200, f"dashboard returned {status}: {dashboard}")
    require(dashboard["user"]["email_verified"] is True, "user should now be email_verified")

    # Idempotent verify
    status, body = request("POST", "/auth/verify/confirm", {"token": verify_token})
    require(status == 400, f"reusing verify token should fail, got {status}: {body}")

    # API key flow
    status, created_key = request(
        "POST", "/me/api-keys", {"name": "smoke key"}, token=access
    )
    require(status == 201, f"api-key create returned {status}: {created_key}")
    raw_key = created_key["api_key"]
    key_id = created_key["key"]["id"]
    require(raw_key.startswith("sk_"), "api key must start with sk_")

    status, keys = request("GET", "/me/api-keys", token=access)
    require(status == 200 and len(keys) == 1, f"api-key list returned {status}: {keys}")
    require(keys[0]["id"] == key_id, "listed key id mismatch")

    # Use API key on an allowed read endpoint to ensure the dependency works.
    # We need a recipe/run to authenticate against; instead test against
    # /api/runs/<random> -- 404 means auth succeeded.
    status, body = request("GET", "/api/runs/00000000-0000-0000-0000-000000000000", api_key=raw_key)
    require(status == 404, f"api-key auth + missing run should be 404, got {status}: {body}")

    # Tampered API key must fail
    status, body = request(
        "GET",
        "/api/runs/00000000-0000-0000-0000-000000000000",
        api_key=raw_key + "x",
    )
    require(status == 401, f"tampered api key should be 401, got {status}: {body}")

    # Revoke API key
    status, body = request("DELETE", f"/me/api-keys/{key_id}", token=access)
    require(status == 200, f"api-key revoke returned {status}: {body}")
    status, body = request(
        "GET", "/api/runs/00000000-0000-0000-0000-000000000000", api_key=raw_key
    )
    require(status == 401, f"revoked key should be 401, got {status}: {body}")

    # Password reset flow
    status, body = request("POST", "/auth/password-reset/request", {"email": email})
    require(status == 200, f"password reset request returned {status}: {body}")
    time.sleep(0.4)
    reset_token = _extract_token(
        "password_reset_token_issued", user_id, key="reset_code_dev"
    )
    status, body = request(
        "POST",
        "/auth/password-reset/confirm",
        {"token": reset_token, "password": new_password},
    )
    require(status == 200 and body.get("status") == "reset", f"reset confirm failed: {body}")

    # Old refresh token should be revoked after reset
    status, body = request("POST", "/auth/refresh", {"refresh_token": refresh})
    require(status == 401, f"refresh after password reset should be 401, got {status}: {body}")

    # New login with new password works
    status, logged = request("POST", "/auth/login", {"email": email, "password": new_password})
    require(status == 200, f"login with new password returned {status}: {logged}")
    new_refresh = logged["refresh_token"]

    # Revoke all sessions
    status, body = request(
        "POST", "/auth/sessions/revoke-all", token=logged["access_token"]
    )
    require(status == 200 and body.get("revoked_count", 0) >= 1, f"revoke-all returned {body}")
    status, body = request("POST", "/auth/refresh", {"refresh_token": new_refresh})
    require(status == 401, f"refresh after revoke-all should be 401, got {status}")

    # Sanity: bogus reset token rejected
    status, body = request(
        "POST",
        "/auth/password-reset/confirm",
        {"token": "this-token-is-not-real", "password": "another-long-password"},
    )
    require(status == 400, f"bogus reset token should be 400, got {status}: {body}")

    # Security headers present
    response_status, _ = request("GET", "/health/live")
    require(response_status == 200, "health live failed")
    # Re-check headers via raw urlopen for header inspection
    req = Request(f"{BASE_URL}/health/live")
    with urlopen(req, timeout=5) as response:
        require(
            response.headers.get("X-Content-Type-Options") == "nosniff",
            "missing X-Content-Type-Options header",
        )
        require(
            response.headers.get("X-Frame-Options") == "DENY",
            "missing X-Frame-Options header",
        )
        require(
            response.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin",
            "missing Referrer-Policy header",
        )

    print("slice9 auth-completion smoke checks passed")


if __name__ == "__main__":
    main()

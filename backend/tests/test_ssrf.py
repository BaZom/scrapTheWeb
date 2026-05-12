import socket
from typing import Any

import pytest
from fastapi import HTTPException

from app import ssrf
from app.ssrf import validate_public_render_url


class FakeResolver:
    def __init__(self, addresses: list[str] | Exception) -> None:
        self.addresses = addresses

    async def __call__(self, hostname: str, port: int) -> set[str]:  # type: ignore[override]
        if isinstance(self.addresses, Exception):
            raise self.addresses
        return set(self.addresses)


@pytest.fixture(autouse=True)
def patch_resolver(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    holder: dict[str, Any] = {"resolver": FakeResolver(["93.184.216.34"])}

    async def _resolve(hostname: str, port: int) -> set[str]:
        return await holder["resolver"](hostname, port)

    monkeypatch.setattr(ssrf, "_resolve_host", _resolve)
    return holder


async def test_allows_public_https_url(patch_resolver: dict[str, Any]) -> None:
    url = await validate_public_render_url("https://example.com/page")
    assert url == "https://example.com/page"


async def test_rejects_non_http_scheme(patch_resolver: dict[str, Any]) -> None:
    with pytest.raises(HTTPException) as exc:
        await validate_public_render_url("file:///etc/passwd")
    assert exc.value.status_code == 400


async def test_rejects_localhost(patch_resolver: dict[str, Any]) -> None:
    with pytest.raises(HTTPException):
        await validate_public_render_url("http://localhost/")


async def test_rejects_private_ip_after_resolution(patch_resolver: dict[str, Any]) -> None:
    patch_resolver["resolver"] = FakeResolver(["10.0.0.1"])
    with pytest.raises(HTTPException) as exc:
        await validate_public_render_url("https://internal.example/")
    assert exc.value.status_code == 400


async def test_rejects_loopback_after_resolution(patch_resolver: dict[str, Any]) -> None:
    patch_resolver["resolver"] = FakeResolver(["127.0.0.1"])
    with pytest.raises(HTTPException):
        await validate_public_render_url("https://innocent.example/")


async def test_rejects_link_local(patch_resolver: dict[str, Any]) -> None:
    patch_resolver["resolver"] = FakeResolver(["169.254.169.254"])
    with pytest.raises(HTTPException):
        await validate_public_render_url("http://metadata/")


async def test_rejects_when_dns_fails(patch_resolver: dict[str, Any]) -> None:
    patch_resolver["resolver"] = FakeResolver(socket.gaierror("no such host"))
    with pytest.raises(HTTPException):
        await validate_public_render_url("https://nonexistent.invalid/")

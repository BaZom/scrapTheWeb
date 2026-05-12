import ipaddress
import socket
from urllib.parse import urlparse

from fastapi import HTTPException, status


def _is_blocked_ip(address: str) -> bool:
    ip = ipaddress.ip_address(address)
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


async def validate_public_render_url(raw_url: str) -> str:
    url = raw_url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="URL must be an absolute http or https URL",
        )

    hostname = parsed.hostname.lower()
    if hostname in {"localhost", "metadata.google.internal"} or hostname.endswith(".localhost"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="URL host is not allowed"
        )

    try:
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        addresses = await _resolve_host(hostname, port)
    except socket.gaierror as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="URL host could not be resolved"
        ) from exc

    if not addresses or any(_is_blocked_ip(address) for address in addresses):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="URL host is not allowed"
        )

    return url


async def _resolve_host(hostname: str, port: int) -> set[str]:
    import asyncio

    def _getaddrinfo() -> set[str]:
        return {
            result[4][0]
            for result in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)
        }

    return await asyncio.to_thread(_getaddrinfo)

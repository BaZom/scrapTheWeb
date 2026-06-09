"""Short-lived in-process cache for page-session HTML snapshots (ADR 0008).

The preview loop re-fetches the frozen ``page.html`` from S3/MinIO and re-parses it on
every call. The snapshot is immutable for the life of a page session, so a small
per-process cache in front of S3 removes the repeated network round-trip on the tight
builder loop.

This is **best-effort only**: S3 remains the durable source of truth. A miss, a process
restart, an eviction, or a disabled cache all fall back to reading from S3 — behavior is
identical, only slower. Nothing here is authoritative.

Bounded three ways so a process can't be starved by it: a max entry count, a max total
byte budget, and a per-item byte cap (oversized snapshots are simply not cached). Entries
also expire by TTL. Eviction is LRU. HTML contents are never logged.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from collections.abc import Callable
from dataclasses import dataclass
from time import monotonic

__all__ = ["PageHtmlCache"]


@dataclass
class _Entry:
    html: str
    size_bytes: int
    expires_at: float


class PageHtmlCache:
    """Thread-safe TTL + LRU cache keyed by the S3 ``html_key``.

    Args:
        max_entries: hard cap on number of cached snapshots.
        max_total_bytes: cap on the summed UTF-8 size of all cached snapshots.
        max_item_bytes: snapshots larger than this are never cached.
        ttl_seconds: how long an entry stays valid after it is stored.
        clock: monotonic seconds source, injectable for tests.
    """

    def __init__(
        self,
        *,
        max_entries: int,
        max_total_bytes: int,
        max_item_bytes: int,
        ttl_seconds: int,
        clock: Callable[[], float] = monotonic,
    ) -> None:
        self._max_entries = max_entries
        self._max_total_bytes = max_total_bytes
        self._max_item_bytes = max_item_bytes
        self._ttl_seconds = ttl_seconds
        self._clock = clock
        self._lock = threading.Lock()
        # Ordered by recency of use; the left end is the eviction candidate (LRU).
        self._entries: OrderedDict[str, _Entry] = OrderedDict()
        self._total_bytes = 0

    def get(self, html_key: str) -> str | None:
        """Return the cached HTML for ``html_key``, or None on miss/expiry."""
        now = self._clock()
        with self._lock:
            entry = self._entries.get(html_key)
            if entry is None:
                return None
            if entry.expires_at <= now:
                # Lazily drop expired entries on access.
                self._remove(html_key)
                return None
            self._entries.move_to_end(html_key)
            return entry.html

    def set(self, html_key: str, html: str) -> None:
        """Cache ``html`` under ``html_key`` if it fits the per-item cap.

        Best-effort: an oversized snapshot is silently skipped (the caller already has the
        HTML from S3). Re-inserting an existing key refreshes its TTL and value.
        """
        size_bytes = len(html.encode("utf-8"))
        if size_bytes > self._max_item_bytes:
            return
        expires_at = self._clock() + self._ttl_seconds
        with self._lock:
            if html_key in self._entries:
                self._remove(html_key)
            self._entries[html_key] = _Entry(
                html=html, size_bytes=size_bytes, expires_at=expires_at
            )
            self._total_bytes += size_bytes
            self._evict_to_budget()

    def _remove(self, html_key: str) -> None:
        entry = self._entries.pop(html_key, None)
        if entry is not None:
            self._total_bytes -= entry.size_bytes

    def _evict_to_budget(self) -> None:
        # Drop least-recently-used entries until both budgets are satisfied. The just-added
        # entry is at the right (most-recent) end, so it is evicted last — a snapshot bigger
        # than the total budget but within the item cap still lands but immediately evicts
        # everything else, which is the intended LRU behavior.
        while self._entries and (
            len(self._entries) > self._max_entries
            or self._total_bytes > self._max_total_bytes
        ):
            oldest_key = next(iter(self._entries))
            self._remove(oldest_key)

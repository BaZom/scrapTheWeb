"""The preview HTML loader uses the cache in front of S3 (ADR 0008)."""

from types import SimpleNamespace

import app.page_sessions as page_sessions
from app.page_html_cache import PageHtmlCache


class _FakeBody:
    def __init__(self, data: bytes) -> None:
        self._data = data

    def read(self) -> bytes:
        return self._data


class _CountingS3:
    """Records every get_object call so we can assert S3 was (not) hit."""

    def __init__(self, html: str) -> None:
        self.calls = 0
        self._html = html

    def get_object(self, *, Bucket: str, Key: str) -> dict[str, object]:
        self.calls += 1
        return {"Body": _FakeBody(self._html.encode("utf-8"))}


def _settings() -> SimpleNamespace:
    return SimpleNamespace(s3_bucket="bucket")


def _page_session() -> SimpleNamespace:
    return SimpleNamespace(html_key="org/abc/page.html")


def _cache() -> PageHtmlCache:
    return PageHtmlCache(
        max_entries=64, max_total_bytes=1_000_000, max_item_bytes=1_000_000, ttl_seconds=60
    )


async def test_cache_hit_avoids_second_s3_read(monkeypatch) -> None:
    s3 = _CountingS3("<html>cached</html>")
    monkeypatch.setattr(page_sessions, "make_s3_client", lambda settings: s3)
    cache = _cache()
    ps, settings = _page_session(), _settings()

    first = await page_sessions._load_page_session_html(ps, settings, cache)
    second = await page_sessions._load_page_session_html(ps, settings, cache)

    assert first == second == "<html>cached</html>"
    assert s3.calls == 1  # second call served from cache


async def test_no_cache_reads_s3_every_time(monkeypatch) -> None:
    s3 = _CountingS3("<html/>")
    monkeypatch.setattr(page_sessions, "make_s3_client", lambda settings: s3)
    ps, settings = _page_session(), _settings()

    await page_sessions._load_page_session_html(ps, settings, None)
    await page_sessions._load_page_session_html(ps, settings, None)

    assert s3.calls == 2  # disabled cache == old behavior


async def test_oversized_html_is_refetched(monkeypatch) -> None:
    s3 = _CountingS3("<html>too-big</html>")
    monkeypatch.setattr(page_sessions, "make_s3_client", lambda settings: s3)
    # Item cap smaller than the payload -> store() skips it -> next call refetches.
    cache = PageHtmlCache(
        max_entries=64, max_total_bytes=1_000_000, max_item_bytes=4, ttl_seconds=60
    )
    ps, settings = _page_session(), _settings()

    await page_sessions._load_page_session_html(ps, settings, cache)
    await page_sessions._load_page_session_html(ps, settings, cache)

    assert s3.calls == 2

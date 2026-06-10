"""Unit tests for the page-session HTML cache (ADR 0008)."""

from app.page_html_cache import PageHtmlCache


class FakeClock:
    """Manually advanced monotonic clock so TTL tests don't sleep."""

    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _cache(clock: FakeClock, **overrides: int) -> PageHtmlCache:
    defaults = dict(
        max_entries=64,
        max_total_bytes=1_000_000,
        max_item_bytes=10_000,
        ttl_seconds=60,
    )
    defaults.update(overrides)
    return PageHtmlCache(clock=clock, **defaults)


def test_hit_returns_cached_html() -> None:
    clock = FakeClock()
    cache = _cache(clock)
    cache.set("k1", "<html>one</html>")
    assert cache.get("k1") == "<html>one</html>"


def test_miss_returns_none() -> None:
    cache = _cache(FakeClock())
    assert cache.get("absent") is None


def test_ttl_expiry_drops_entry() -> None:
    clock = FakeClock()
    cache = _cache(clock, ttl_seconds=60)
    cache.set("k1", "<html/>")
    clock.advance(59)
    assert cache.get("k1") == "<html/>"
    clock.advance(2)  # now 61s after set -> expired
    assert cache.get("k1") is None


def test_oversized_html_is_not_cached() -> None:
    clock = FakeClock()
    cache = _cache(clock, max_item_bytes=8)
    cache.set("big", "x" * 9)
    assert cache.get("big") is None
    cache.set("ok", "x" * 8)
    assert cache.get("ok") == "x" * 8


def test_lru_eviction_by_entry_count() -> None:
    clock = FakeClock()
    cache = _cache(clock, max_entries=2)
    cache.set("a", "1")
    cache.set("b", "2")
    cache.get("a")  # touch a -> b is now least-recently-used
    cache.set("c", "3")  # over count -> evicts b
    assert cache.get("a") == "1"
    assert cache.get("c") == "3"
    assert cache.get("b") is None


def test_eviction_by_byte_budget() -> None:
    clock = FakeClock()
    # Budget fits two 4-byte entries but not three.
    cache = _cache(clock, max_total_bytes=8, max_item_bytes=4)
    cache.set("a", "aaaa")
    cache.set("b", "bbbb")
    cache.set("c", "cccc")  # total would be 12 > 8 -> evicts oldest (a)
    assert cache.get("a") is None
    assert cache.get("b") == "bbbb"
    assert cache.get("c") == "cccc"


def test_reinsert_refreshes_value_and_ttl_without_double_counting() -> None:
    clock = FakeClock()
    cache = _cache(clock, max_total_bytes=8, max_item_bytes=8, ttl_seconds=60)
    cache.set("k", "aaaa")
    cache.set("k", "bbbb")  # replace, not append
    assert cache.get("k") == "bbbb"
    # A second 4-byte entry still fits because the replace didn't double-count bytes.
    cache.set("k2", "cccc")
    assert cache.get("k2") == "cccc"
    assert cache.get("k") == "bbbb"

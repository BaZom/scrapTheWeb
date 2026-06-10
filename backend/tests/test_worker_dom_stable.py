"""Unit tests for worker._wait_for_dom_stable.

Driven by a fake page (no browser): the helper only needs `evaluate` and
`wait_for_timeout`. Regression guard for the consent-rebuild race on sites like
kleinanzeigen, where dismissing the CMP tears the page down (destroying the JS
execution context) and re-hydrates the listings ~1-2s later.
"""
import asyncio

import pytest

pytestmark = pytest.mark.asyncio

worker = pytest.importorskip("app.worker")
_wait_for_dom_stable = worker._wait_for_dom_stable


class FakePage:
    """Returns scripted element counts; a sentinel raises to mimic a destroyed context."""

    RAISE = object()

    def __init__(self, sequence: list[object]) -> None:
        self._sequence = list(sequence)
        self._last = self._sequence[-1]
        self.evaluate_calls = 0

    async def evaluate(self, _script: str) -> int:
        self.evaluate_calls += 1
        value = self._sequence.pop(0) if self._sequence else self._last
        if value is self.RAISE:
            raise RuntimeError("Execution context was destroyed (navigation)")
        return value  # type: ignore[return-value]

    async def wait_for_timeout(self, ms: int) -> None:
        await asyncio.sleep(ms / 1000)


async def test_waits_through_teardown_then_returns_rehydrated_count() -> None:
    # navigating (raises) -> collapsed shell (<=100, ignored) -> rehydrated & stable.
    page = FakePage([FakePage.RAISE, FakePage.RAISE, 40, 40, 1500, 1500, 1500, 1500, 1500])
    result = await _wait_for_dom_stable(page, timeout_ms=2000, quiet_ms=15, poll_ms=5)
    assert result == 1500  # old `break`-on-exception code returned -1 here


async def test_shell_alone_never_counts_as_stable() -> None:
    # A count <=100 must never satisfy stability, even if perfectly steady.
    page = FakePage([40] * 50)
    result = await _wait_for_dom_stable(page, timeout_ms=200, quiet_ms=15, poll_ms=5)
    assert result == 40  # falls through to the deadline, returns last seen


async def test_returns_promptly_when_already_stable() -> None:
    page = FakePage([900] * 20)
    result = await _wait_for_dom_stable(page, timeout_ms=2000, quiet_ms=15, poll_ms=5)
    assert result == 900

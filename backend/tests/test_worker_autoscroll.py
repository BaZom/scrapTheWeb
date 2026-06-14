"""Unit tests for worker._autoscroll.

Driven by a fake page (no browser): the helper only needs `evaluate` (height query,
scrollBy, an at-bottom check, scrollTo) and `wait_for_timeout`. Guards the two things
that matter: it stops once a finite page is fully scrolled, and a growing/infinite page
can't loop past the step cap — and it always resets to the top.
"""
import asyncio

import pytest

pytestmark = pytest.mark.asyncio

worker = pytest.importorskip("app.worker")
_autoscroll = worker._autoscroll


class FakeScrollPage:
    """Simulates scroll height/position. `grow` mimics lazy content loading on each scroll."""

    def __init__(
        self, *, height: int = 1500, inner: int = 1000, grow: int = 0, fail_at_bottom: bool = False
    ) -> None:
        self.height = height
        self.inner = inner
        self.grow = grow
        self.fail_at_bottom = fail_at_bottom
        self.scroll_y = 0
        self.scroll_bys = 0
        self.scroll_to_top = 0

    async def evaluate(self, script: str, *args: object) -> object:
        if "innerHeight" in script:  # the at-bottom predicate (checked before plain height)
            # Simulate a mid-scroll failure: scrollBy already advanced the page this iteration.
            if self.fail_at_bottom:
                raise RuntimeError("evaluate failed after a scroll")
            return self.inner + self.scroll_y >= self.height - 2
        if "scrollBy" in script:
            self.scroll_bys += 1
            step = int(args[0]) if args else 0
            self.scroll_y = min(self.scroll_y + step, max(0, self.height - self.inner))
            if self.grow:
                self.height += self.grow
            return None
        if "scrollTo(0, 0)" in script:
            self.scroll_to_top += 1
            self.scroll_y = 0
            return None
        if "scrollHeight" in script:  # plain height query
            return self.height
        return None

    async def wait_for_timeout(self, _ms: int) -> None:
        await asyncio.sleep(0)


class RaisingPage:
    async def evaluate(self, _script: str, *_args: object) -> object:
        raise RuntimeError("evaluate failed mid-scroll")

    async def wait_for_timeout(self, _ms: int) -> None:
        await asyncio.sleep(0)


async def test_stops_when_finite_page_reaches_bottom() -> None:
    page = FakeScrollPage(height=1500, inner=1000)
    await _autoscroll(page, max_scrolls=12, step_px=1400, settle_ms=0)
    assert page.scroll_bys == 1  # one step reaches the bottom of a short page
    assert page.scroll_to_top == 1  # always resets to top


async def test_growing_page_is_bounded_by_step_cap() -> None:
    # Height grows every scroll (infinite-scroll feed): must stop at the cap, not loop forever.
    page = FakeScrollPage(height=4000, inner=1000, grow=2000)
    await _autoscroll(page, max_scrolls=6, step_px=1400, settle_ms=0)
    assert page.scroll_bys == 6
    assert page.scroll_to_top == 1


async def test_best_effort_swallows_evaluate_errors() -> None:
    # A scroll/evaluate hiccup must never fail the render.
    await _autoscroll(RaisingPage(), max_scrolls=3, step_px=1400, settle_ms=0)


async def test_resets_to_top_even_when_scroll_fails_partway() -> None:
    # Failure AFTER a scrollBy (P1): the page is left scrolled; the finally must still reset to
    # the top, or dom_candidates.js captures viewport-relative geometry from a scrolled page.
    page = FakeScrollPage(height=4000, inner=1000, fail_at_bottom=True)
    await _autoscroll(page, max_scrolls=12, step_px=1400, settle_ms=0)
    assert page.scroll_bys == 1  # we did scroll before failing
    assert page.scroll_to_top == 1  # reset still attempted via finally
    assert page.scroll_y == 0  # and it took effect

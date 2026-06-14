"""Browser-engine extraction tests (extract_rows.js) — the Phase B premise.

These run the SAME script the saved run uses, in a real headless Chromium, against the exact
HTML that broke the old Python matcher (see docs/backlog/extraction-robustness.md repros). They
prove the run now extracts correctly where recipe_runner diverged. Skipped automatically if a
browser binary isn't available in the environment.
"""
import pytest

pytestmark = pytest.mark.asyncio

async_playwright = pytest.importorskip("playwright.async_api").async_playwright
worker = pytest.importorskip("app.worker")
_EXTRACT_JS = worker._render_script("extract_rows.js")


async def _extract(html: str, spec: dict) -> list[dict]:
    async with async_playwright() as p:
        try:
            browser = await p.chromium.launch(headless=True)
        except Exception as exc:  # no browser binary in this env
            pytest.skip(f"chromium unavailable: {exc}")
        try:
            page = await browser.new_page()
            await page.set_content(html, wait_until="domcontentloaded")
            result = await page.evaluate(_EXTRACT_JS, spec)
            return result
        finally:
            await browser.close()


async def test_table_listing_with_implicit_tbody() -> None:
    # recipe_runner: `table > tbody > tr` matched 0 rows (no implied <tbody>). The browser
    # inserts <tbody>, so the run extracts both rows.
    html = "<table><tr><td>r1</td></tr><tr><td>r2</td></tr></table>"
    rows = await _extract(
        html,
        {
            "containerSelector": "table > tbody > tr",
            "fields": [{"name": "v", "selector": "td", "extract": "text"}],
            "pageType": "listing",
            "limit": None,
        },
    )
    assert [r["v"] for r in rows] == ["r1", "r2"]


async def test_optional_closing_li_nth_of_type() -> None:
    # recipe_runner nested the <li>s (no auto-close), so li:nth-of-type(2) matched nothing.
    html = "<ul><li>A<li>B<li>C</ul>"
    rows = await _extract(
        html,
        {
            "containerSelector": "ul",
            "fields": [{"name": "second", "selector": "li:nth-of-type(2)", "extract": "text"}],
            "pageType": "listing",
            "limit": None,
        },
    )
    assert rows == [{"second": "B"}]


async def test_single_page_text_uses_innertext_and_collapses_whitespace() -> None:
    # Single-page sprout: one page-wide row; innerText skips display:none and we collapse runs.
    html = "<div id='t'><span style='display:none'>HIDDEN</span>Visible   text</div>"
    rows = await _extract(
        html,
        {
            "containerSelector": "body",
            "fields": [{"name": "t", "selector": "#t", "extract": "text"}],
            "pageType": "single",
            "limit": None,
        },
    )
    assert rows == [{"t": "Visible text"}]

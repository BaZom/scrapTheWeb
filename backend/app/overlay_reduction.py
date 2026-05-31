import re
from typing import Any

DISMISS_PATTERNS = (
    (
        "reject_optional",
        re.compile(r"alle ablehnen|nicht akzeptieren|ablehnen|reject all|reject|decline|deny", re.I),
    ),
    (
        "necessary_only",
        re.compile(
            r"nur notwendige|nur erforderliche|nur essenziell|nur essentiell|"
            r"notwendige auswählen|erforderliche auswählen|necessary only|essential only|"
            r"only necessary|only essential|reject non-essential|save choices|"
            r"confirm choices|confirm my choices|save selection|auswahl speichern|"
            r"auswahl bestätigen|einstellungen speichern|continue without accepting|"
            r"without accepting",
            re.I,
        ),
    ),
    (
        "close_prompt",
        re.compile(
            r"schließen|schliessen|close|dismiss|not now|later|später|nein danke|no thanks|"
            r"continue without|weiter ohne|skip|überspringen",
            re.I,
        ),
    ),
)

# Last-resort fallback ONLY: some CMPs (e.g. autoscout24) expose no top-level reject/
# close — just "Alle akzeptieren" + a settings sub-dialog. Accepting is then the only
# one-click way to clear the overlay and reach the content. Tried after every reject/
# necessary/close pattern fails, so privacy-preserving dismissal still wins where offered.
ACCEPT_FALLBACK = re.compile(
    r"alle akzeptieren|alle zulassen|alle annehmen|akzeptieren und schließen|akzeptieren|"
    r"zustimmen|einverstanden|accept all|accept cookies|allow all|i agree|agree|accept",
    re.I,
)


async def reduce_blocking_overlays(page: Any) -> list[dict[str, str]]:
    # Kept fast: this runs on every render. Short settle + at most 2 passes with brief
    # waits. Once a banner is dismissed we stop chasing lingering modals (Escape no
    # longer keeps the loop alive), which previously made this the slowest render phase.
    dismissed: list[dict[str, str]] = []
    await _install_overlay_handlers(page, dismissed)
    await page.wait_for_timeout(250)

    for _ in range(2):
        previous_count = len(dismissed)
        for frame in page.frames:
            await _dismiss_in_frame(frame, dismissed)
        if len(dismissed) != previous_count:
            await page.wait_for_timeout(250)
            continue
        # No reject/necessary/close button this pass. Try accept-all (last resort),
        # then a single Escape; then stop — the overlay is either gone or not dismissable.
        progressed = False
        for frame in page.frames:
            if await _dismiss_pattern(frame, "accept_all", ACCEPT_FALLBACK, dismissed):
                progressed = True
                break
        if not progressed:
            await _escape_modal(page, dismissed)
        break
    return dismissed


async def _install_overlay_handlers(page: Any, dismissed: list[dict[str, str]]) -> None:
    for name, pattern in DISMISS_PATTERNS:
        try:
            trigger = page.get_by_text(pattern).first

            # Playwright (>=1.42) invokes the handler with the triggering Locator as the
            # first positional arg. Absorb it in `_triggered` so it doesn't clobber the
            # `pattern` closure default (which previously turned pattern into a Locator and
            # raised "'Locator' object has no attribute 'replace'").
            async def handler(
                _triggered: Any = None,
                pattern: re.Pattern[str] = pattern,
                name: str = name,
            ) -> None:
                for frame in page.frames:
                    if await _dismiss_pattern(frame, name, pattern, dismissed):
                        return

            await page.add_locator_handler(trigger, handler, times=1, no_wait_after=True)
        except Exception:
            continue


async def _dismiss_in_frame(frame: Any, dismissed: list[dict[str, str]]) -> None:
    for name, pattern in DISMISS_PATTERNS:
        if await _dismiss_pattern(frame, name, pattern, dismissed):
            return


async def _dismiss_pattern(
    frame: Any,
    name: str,
    pattern: re.Pattern[str],
    dismissed: list[dict[str, str]],
) -> bool:
    locators = [
        frame.get_by_role("button", name=pattern),
        frame.get_by_role("link", name=pattern),
        frame.get_by_label(pattern),
        frame.get_by_title(pattern),
        frame.locator("button").filter(has_text=pattern),
        frame.locator("a").filter(has_text=pattern),
        frame.locator("[role='button']").filter(has_text=pattern),
        frame.locator("input[type='button']").filter(has_text=pattern),
        frame.locator("input[type='submit']").filter(has_text=pattern),
    ]
    for locator in locators:
        try:
            count = min(await locator.count(), 4)
        except Exception:
            continue
        for index in range(count):
            try:
                await locator.nth(index).click(timeout=800)
                dismissed.append({"strategy": name, "text": pattern.pattern[:80]})
                return True
            except Exception:
                continue
    return False


async def _escape_modal(page: Any, dismissed: list[dict[str, str]]) -> bool:
    try:
        dialogs = page.locator("[role='dialog'], [aria-modal='true']")
        if await dialogs.count() < 1:
            return False
        await page.keyboard.press("Escape")
        dismissed.append({"strategy": "escape_modal", "text": "Escape"})
        return True
    except Exception:
        return False

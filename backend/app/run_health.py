"""Drift / block detection for monitoring runs (pure decision logic).

A saved sprout whose selectors silently stop matching (the site re-skinned, a class
changed, a layout shifted) extracts zero rows. The diff engine then reads previous-N
vs current-0 as "everything was removed" and persists a mass-removal lie. A monitoring
tool that lies is worse than no tool, so a run must be assessed *before* its diff is
persisted and quarantined when it looks broken rather than genuinely changed.

This module is intentionally pure (no DB / no I/O) so the decision is unit-tested in
isolation. The worker supplies the signals and acts on the verdict; see
``run_recipe`` in ``app.worker``.
"""

from typing import Literal

# A run is only flagged as drift when the current extraction collapses to at or below
# this fraction of the established baseline. Start strict (0.0 ⇒ only a total wipeout
# to zero trips it): a genuine "all listings gone" is rare, and quarantine-and-ask is
# the safe default. Raise toward e.g. 0.1 later if real-world drift commonly leaves a
# few stray matches. Kept as a single knob so tuning is a one-line change.
DRIFT_FLOOR_RATIO = 0.0

RunHealth = Literal["ok", "drift", "empty", "blocked"]


def assess_run_health(
    *,
    current_count: int,
    baseline_count: int,
    access_blocked: bool,
    page_had_content: bool,
) -> RunHealth:
    """Decide whether a finished run is healthy, drifted, empty, or blocked.

    - ``blocked``: the render hit an anti-bot wall (401/403/429/…). The empty result is
      a block, not a real change — never diff it.
    - ``drift`` / ``empty``: a baseline of real items existed yet extraction collapsed to
      (at most) ``DRIFT_FLOOR_RATIO`` of that baseline. Diffing that would persist a false
      "everything removed", so **both** quarantine. ``page_had_content`` only picks the
      explanation: content present but our items vanished ⇒ ``drift`` (selectors broke,
      re-pick); the page came back blank/near-empty ⇒ ``empty`` (the fetch itself
      delivered nothing — often transient).
    - ``ok``: everything else — first run (no baseline), or a genuine partial shrink that
      still extracted items. The normal diff is trustworthy.

    Pure: all signals are passed in; nothing is read from the DB or network here.
    """
    if access_blocked:
        return "blocked"

    if baseline_count > 0:
        floor = int(baseline_count * DRIFT_FLOOR_RATIO)
        if current_count <= floor:
            return "drift" if page_had_content else "empty"

    return "ok"


def drift_message(health: RunHealth) -> str:
    """Honest, non-coder-facing reason for a quarantined run (stored on the run).

    No selector/code language — the user fixes by re-picking the items (the standing
    builder guardrail), so the copy points there.
    """
    if health == "blocked":
        return "This site blocked the run, so no changes were recorded. Try again later."
    if health == "drift":
        return (
            "This sprout stopped finding items — the page may have changed. "
            "Re-open it and re-pick the items to fix it. No changes were recorded for this run."
        )
    if health == "empty":
        return (
            "The page came back empty, so no changes were recorded. This is often temporary — "
            "try again, and re-pick the items if it keeps happening."
        )
    return ""


__all__ = ["assess_run_health", "drift_message", "DRIFT_FLOOR_RATIO", "RunHealth"]

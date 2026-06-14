from app.run_health import assess_run_health, drift_message


def test_drift_when_baseline_populated_and_extraction_collapses_to_zero() -> None:
    health = assess_run_health(
        current_count=0,
        baseline_count=20,
        access_blocked=False,
        page_had_content=True,
    )
    assert health == "drift"


def test_block_takes_precedence_over_everything() -> None:
    # Even with a healthy-looking count, an anti-bot block is never a real result.
    health = assess_run_health(
        current_count=0,
        baseline_count=20,
        access_blocked=True,
        page_had_content=True,
    )
    assert health == "blocked"


def test_first_run_has_no_baseline_so_zero_is_ok() -> None:
    # No prior completed run (baseline 0) ⇒ a zero result can't be distinguished from
    # a genuinely empty page; do not quarantine.
    assert (
        assess_run_health(
            current_count=0,
            baseline_count=0,
            access_blocked=False,
            page_had_content=True,
        )
        == "ok"
    )


def test_blank_page_collapse_to_zero_quarantines_as_empty() -> None:
    # A populated baseline collapsing to zero is untrustworthy whether or not the page had
    # content: diffing it would persist a false mass-removal. A blank/error shell can't be
    # blamed on broken selectors, so it quarantines as "empty" (not "drift"), but it must
    # still NOT fall through to "ok" and get diffed.
    assert (
        assess_run_health(
            current_count=0,
            baseline_count=20,
            access_blocked=False,
            page_had_content=False,
        )
        == "empty"
    )


def test_genuine_shrink_is_ok() -> None:
    # Fewer items than before, but still extracting — a real change, not drift.
    assert (
        assess_run_health(
            current_count=18,
            baseline_count=20,
            access_blocked=False,
            page_had_content=True,
        )
        == "ok"
    )


def test_steady_state_is_ok() -> None:
    assert (
        assess_run_health(
            current_count=20,
            baseline_count=20,
            access_blocked=False,
            page_had_content=True,
        )
        == "ok"
    )


def test_quarantine_states_carry_honest_non_coder_messages() -> None:
    drift = drift_message("drift")
    empty = drift_message("empty")
    blocked = drift_message("blocked")
    assert "re-pick" in drift.lower()
    assert "no changes were recorded" in drift.lower()
    assert empty and "empty" in empty.lower()
    assert blocked and "blocked" in blocked.lower()
    # No code/selector jargon leaks to the user (builder guardrail).
    for message in (drift, empty, blocked):
        for term in ("selector", "css", "xpath", "nth-child", "href"):
            assert term not in message.lower()
    assert drift_message("ok") == ""

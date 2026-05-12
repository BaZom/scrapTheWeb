from app.change_detector import detect_changes


def test_detects_new_changed_and_removed() -> None:
    previous = {
        "a": {"price": "10"},
        "b": {"price": "20"},
        "c": {"price": "30"},
    }
    current = {
        "a": {"price": "10"},
        "b": {"price": "22"},
        "d": {"price": "40"},
    }
    events = detect_changes(previous, current)
    by_type = {(event["change_type"], event["record_key"]): event for event in events}
    assert ("new", "d") in by_type
    assert ("changed", "b") in by_type
    assert ("removed", "c") in by_type
    assert ("changed", "a") not in by_type
    assert by_type[("changed", "b")]["old_data"] == {"price": "20"}
    assert by_type[("changed", "b")]["new_data"] == {"price": "22"}


def test_no_changes_when_records_identical() -> None:
    previous = {"a": {"price": "10"}}
    current = {"a": {"price": "10"}}
    assert detect_changes(previous, current) == []


def test_empty_previous_yields_all_new() -> None:
    current = {"a": {"x": "1"}, "b": {"x": "2"}}
    events = detect_changes({}, current)
    assert {event["change_type"] for event in events} == {"new"}
    assert {event["record_key"] for event in events} == {"a", "b"}

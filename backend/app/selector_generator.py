import re
from typing import Any, Literal

STABLE_ATTRS = (
    "data-testid",
    "data-test",
    "data-cy",
    "data-qa",
    "data-id",
    "itemprop",
    "role",
)

SelectorMode = Literal["container", "node"]


def generate_selector(
    dom_nodes: list[dict[str, Any]],
    node_id: str,
    mode: SelectorMode,
    container_selector: str | None = None,
) -> dict[str, Any]:
    nodes = [_normalize_node(node) for node in dom_nodes if isinstance(node, dict)]
    node_by_id = {node["nodeId"]: node for node in nodes}
    selected = node_by_id.get(node_id)
    if selected is None:
        raise ValueError("Selected node was not found in the page-session DOM")
    if mode != "container" and container_selector:
        return _generate_relative_selector(nodes, node_by_id, selected, container_selector)

    candidates = _stable_attribute_candidates(selected)
    candidates.extend(_class_candidates(selected))
    candidates.extend(_tag_candidate(selected))

    scored: list[tuple[tuple[int, int, int, int], str, str]] = []
    for selector, strategy in candidates:
        match_count = count_matches(nodes, selector)
        if match_count < 1:
            continue
        if mode == "container":
            repeated_bonus = 0 if match_count > 1 else 1
            overly_broad = 1 if match_count > 100 else 0
            score = (repeated_bonus, overly_broad, _strategy_rank(strategy), len(selector))
        else:
            unique_bonus = 0 if match_count == 1 else 1
            score = (unique_bonus, _strategy_rank(strategy), match_count, len(selector))
        scored.append((score, selector, strategy))

    if scored:
        _, selector, strategy = sorted(scored)[0]
    else:
        selector = _fallback_path(selected, node_by_id, nodes)
        strategy = "fallback_path"

    return {
        "selector": selector,
        "matchCount": count_matches(nodes, selector),
        "strategy": strategy,
    }


def _generate_relative_selector(
    nodes: list[dict[str, Any]],
    node_by_id: dict[str, dict[str, Any]],
    selected: dict[str, Any],
    container_selector: str,
) -> dict[str, Any]:
    container_nodes = _matching_nodes(nodes, container_selector)
    container_ids = {node["nodeId"] for node in container_nodes}
    selected_container = _nearest_ancestor_in(selected, node_by_id, container_ids)
    if selected_container is None:
        raise ValueError("Selected node is not inside the selected container")

    candidates = _stable_attribute_candidates(selected)
    candidates.extend(_class_candidates(selected))
    candidates.extend(_tag_candidate(selected))
    candidates.extend(_relative_path_candidates(selected, selected_container, node_by_id, nodes))

    scored: list[tuple[tuple[int, int, int], str, str, int]] = []
    for selector, strategy in candidates:
        per_container_counts = [
            len(_matching_descendants(container, nodes, selector)) for container in container_nodes
        ]
        if not per_container_counts or per_container_counts[0] < 1:
            continue
        selected_matches = _matching_descendants(selected_container, nodes, selector)
        if selected["nodeId"] not in {node["nodeId"] for node in selected_matches}:
            continue
        exact_bonus = 0 if all(count == 1 for count in per_container_counts) else 1
        selected_count = per_container_counts[0]
        score = (exact_bonus, _strategy_rank(strategy), len(selector))
        scored.append((score, selector, strategy, selected_count))

    if scored:
        _, selector, strategy, match_count = sorted(scored)[0]
    else:
        selector = _relative_path_candidates(selected, selected_container, node_by_id, nodes)[-1][0]
        strategy = "relative_fallback_path"
        match_count = len(_matching_descendants(selected_container, nodes, selector))

    return {"selector": selector, "matchCount": match_count, "strategy": strategy}


def count_matches(dom_nodes: list[dict[str, Any]], selector: str) -> int:
    return len(_matching_nodes(dom_nodes, selector))


def _matching_nodes(dom_nodes: list[dict[str, Any]], selector: str) -> list[dict[str, Any]]:
    nodes = [_normalize_node(node) for node in dom_nodes if isinstance(node, dict)]
    node_by_id = {node["nodeId"]: node for node in nodes}
    segments = [_parse_segment(part.strip()) for part in selector.split(">")]
    if not segments:
        return []
    return [node for node in nodes if _matches_selector_chain(node, segments, node_by_id)]


def _matching_descendants(
    container: dict[str, Any], nodes: list[dict[str, Any]], selector: str
) -> list[dict[str, Any]]:
    descendant_nodes = [
        node
        for node in nodes
        if node["nodeId"] != container["nodeId"]
        and _is_descendant(node, container, nodes)
    ]
    return _matching_nodes(descendant_nodes, selector)


def _is_descendant(
    node: dict[str, Any], ancestor: dict[str, Any], nodes: list[dict[str, Any]]
) -> bool:
    node_by_id = {candidate["nodeId"]: candidate for candidate in nodes}
    current = node
    while isinstance(current.get("parentNodeId"), str):
        parent = node_by_id.get(current["parentNodeId"])
        if parent is None:
            return False
        if parent["nodeId"] == ancestor["nodeId"]:
            return True
        current = parent
    return False


def _nearest_ancestor_in(
    node: dict[str, Any],
    node_by_id: dict[str, dict[str, Any]],
    ancestor_ids: set[str],
) -> dict[str, Any] | None:
    current = node
    while isinstance(current.get("parentNodeId"), str):
        parent = node_by_id.get(current["parentNodeId"])
        if parent is None:
            return None
        if parent["nodeId"] in ancestor_ids:
            return parent
        current = parent
    return None


def _relative_path_candidates(
    node: dict[str, Any],
    container: dict[str, Any],
    node_by_id: dict[str, dict[str, Any]],
    nodes: list[dict[str, Any]],
) -> list[tuple[str, str]]:
    plain_segments: list[str] = []
    strict_segments: list[str] = []
    current: dict[str, Any] | None = node
    while current is not None and current["nodeId"] != container["nodeId"]:
        plain_segments.append(_plain_path_segment(current))
        strict_segments.append(_path_segment(current, nodes))
        parent_id = current.get("parentNodeId")
        current = node_by_id.get(parent_id) if isinstance(parent_id, str) else None
    plain_path = " > ".join(reversed(plain_segments))
    strict_path = " > ".join(reversed(strict_segments))
    candidates = []
    if plain_path:
        candidates.append((plain_path, "relative_path"))
    if strict_path and strict_path != plain_path:
        candidates.append((strict_path, "relative_fallback_path"))
    return candidates


def _plain_path_segment(node: dict[str, Any]) -> str:
    tag = node["tag"]
    stable_classes = [class_name for class_name in node["classes"] if _stable_class(class_name)]
    return f"{tag}.{_css_ident(stable_classes[0])}" if stable_classes else tag


def _stable_attribute_candidates(node: dict[str, Any]) -> list[tuple[str, str]]:
    tag = node["tag"]
    attrs = node["attrs"]
    candidates: list[tuple[str, str]] = []

    node_id = attrs.get("id")
    if node_id and _safe_attr_value(node_id):
        candidates.append((f"{tag}#{_css_ident(node_id)}", "stable_id"))

    for attr in STABLE_ATTRS:
        value = attrs.get(attr)
        if value and _safe_attr_value(value):
            candidates.append((f'{tag}[{attr}="{_css_string(value)}"]', f"stable_attr:{attr}"))
    return candidates


def _class_candidates(node: dict[str, Any]) -> list[tuple[str, str]]:
    tag = node["tag"]
    classes = [class_name for class_name in node["classes"] if _stable_class(class_name)]
    candidates = [(f"{tag}.{_css_ident(class_name)}", "stable_class") for class_name in classes]
    if len(classes) >= 2:
        joined = "".join(f".{_css_ident(class_name)}" for class_name in classes[:2])
        candidates.insert(0, (f"{tag}{joined}", "stable_class_combo"))
    return candidates


def _tag_candidate(node: dict[str, Any]) -> list[tuple[str, str]]:
    return [(node["tag"], "tag")]


def _fallback_path(
    node: dict[str, Any],
    node_by_id: dict[str, dict[str, Any]],
    nodes: list[dict[str, Any]],
) -> str:
    segments: list[str] = []
    current: dict[str, Any] | None = node
    while current is not None:
        segments.append(_path_segment(current, nodes))
        parent_id = current.get("parentNodeId")
        current = node_by_id.get(parent_id) if isinstance(parent_id, str) else None
        if len(segments) >= 6:
            break
    return " > ".join(reversed(segments))


def _path_segment(node: dict[str, Any], nodes: list[dict[str, Any]]) -> str:
    tag = node["tag"]
    stable_classes = [class_name for class_name in node["classes"] if _stable_class(class_name)]
    base = f"{tag}.{_css_ident(stable_classes[0])}" if stable_classes else tag
    index = _nth_of_type(node, nodes)
    return f"{base}:nth-of-type({index})"


def _nth_of_type(node: dict[str, Any], nodes: list[dict[str, Any]]) -> int:
    same_type_siblings = [
        candidate
        for candidate in nodes
        if candidate.get("parentNodeId") == node.get("parentNodeId")
        and candidate.get("tag") == node.get("tag")
    ]
    for index, sibling in enumerate(same_type_siblings, start=1):
        if sibling["nodeId"] == node["nodeId"]:
            return index
    return 1


def _matches_selector_chain(
    node: dict[str, Any],
    segments: list[dict[str, Any]],
    node_by_id: dict[str, dict[str, Any]],
) -> bool:
    current: dict[str, Any] | None = node
    for segment in reversed(segments):
        if current is None or not _matches_segment(current, segment):
            return False
        parent_id = current.get("parentNodeId")
        current = node_by_id.get(parent_id) if isinstance(parent_id, str) else None
    return True


def _matches_segment(node: dict[str, Any], segment: dict[str, Any]) -> bool:
    if segment["tag"] and node["tag"] != segment["tag"]:
        return False
    attrs = node["attrs"]
    if segment["id"] and attrs.get("id") != segment["id"]:
        return False
    if not set(segment["classes"]).issubset(set(node["classes"])):
        return False
    for attr, value in segment["attrs"].items():
        if attrs.get(attr) != value:
            return False
    nth = segment["nth"]
    if nth is not None and _nth_of_type_from_node(node) != nth:
        return False
    return True


def _nth_of_type_from_node(node: dict[str, Any]) -> int:
    raw = node.get("nthOfType")
    return raw if isinstance(raw, int) and raw > 0 else 1


def _parse_segment(segment: str) -> dict[str, Any]:
    nth: int | None = None
    nth_match = re.search(r":nth-of-type\((\d+)\)$", segment)
    if nth_match:
        nth = int(nth_match.group(1))
        segment = segment[: nth_match.start()]

    attrs = {
        match.group("name"): _unescape_css_string(match.group("value"))
        for match in re.finditer(r'\[(?P<name>[\w:-]+)="(?P<value>(?:\\.|[^"])*)"\]', segment)
    }
    segment = re.sub(r'\[[\w:-]+="(?:\\.|[^"])*"\]', "", segment)

    id_value: str | None = None
    id_match = re.search(r"#([A-Za-z_][\w-]*|\\[^\s.#\[]+)", segment)
    if id_match:
        id_value = _unescape_css_ident(id_match.group(1))
        segment = segment.replace(id_match.group(0), "", 1)

    classes = [_unescape_css_ident(value) for value in re.findall(r"\.([A-Za-z_][\w-]*)", segment)]
    segment = re.sub(r"\.[A-Za-z_][\w-]*", "", segment)
    tag = segment.strip() or None

    return {"tag": tag, "id": id_value, "classes": classes, "attrs": attrs, "nth": nth}


def _normalize_node(node: dict[str, Any]) -> dict[str, Any]:
    attrs = node.get("attrs") if isinstance(node.get("attrs"), dict) else {}
    classes = node.get("classes") if isinstance(node.get("classes"), list) else []
    return {
        **node,
        "nodeId": str(node.get("nodeId", "")),
        "tag": str(node.get("tag", "")).lower(),
        "attrs": {str(key): str(value) for key, value in attrs.items() if value is not None},
        "classes": [str(value) for value in classes],
    }


def _strategy_rank(strategy: str) -> int:
    if strategy.startswith("stable_attr"):
        return 0
    return {
        "stable_id": 1,
        "stable_class_combo": 2,
        "stable_class": 3,
        "tag": 4,
        "fallback_path": 5,
    }.get(strategy, 9)


def _safe_attr_value(value: str) -> bool:
    cleaned = value.strip()
    return 0 < len(cleaned) <= 96 and not _looks_generated(cleaned)


def _stable_class(class_name: str) -> bool:
    return 0 < len(class_name) <= 64 and not _looks_generated(class_name)


def _looks_generated(value: str) -> bool:
    lowered = value.lower()
    if re.search(r"[a-f0-9]{8,}", lowered):
        return True
    if lowered.startswith(("css-", "sc-", "styled-", "emotion-")):
        return True
    digits = sum(character.isdigit() for character in lowered)
    return len(lowered) >= 12 and digits / len(lowered) > 0.3


def _css_ident(value: str) -> str:
    if re.fullmatch(r"-?[_a-zA-Z][-_a-zA-Z0-9]*", value):
        return value
    return "\\" + value.replace("\\", "\\\\").replace(" ", "\\ ")


def _unescape_css_ident(value: str) -> str:
    return value.replace("\\ ", " ").replace("\\\\", "\\")


def _css_string(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"')


def _unescape_css_string(value: str) -> str:
    return value.replace('\\"', '"').replace("\\\\", "\\")

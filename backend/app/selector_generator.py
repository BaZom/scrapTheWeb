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

    matched = _matching_nodes(nodes, selector)
    return {
        "selector": selector,
        "matchCount": len(matched),
        "strategy": strategy,
        # The exact nodes this selector matches, so the UI can outline the whole set
        # instead of approximating it client-side (ADR 0001 Decision 4 → ADR 0007).
        "matchedNodeIds": [node["nodeId"] for node in matched],
    }


def preview_from_snapshot(
    dom_nodes: list[dict[str, Any]],
    container_selector: str,
    picks: list[dict[str, str]],
    limit: int = 20,
) -> dict[str, Any]:
    """Fast preview straight from the render snapshot — no S3 fetch, no HTML re-parse.

    The render already captured every element's text/href/src into ``domNodes`` (ADR 0009).
    For *building and verifying* a recipe against this example page, that snapshot is enough,
    so we generate each picked field's selector and read its value from the snapshot itself,
    over every matched item. The *saved run* still extracts from freshly-fetched HTML — that's
    where full fidelity matters; preview values here are the snapshot's (text capped ~160ch).

    ``picks`` is ``[{nodeId, extract, name}]``. Returns ``{rows, fields}`` — the extracted rows
    plus the generated ``{name, selector, extract}`` fields (so the caller can save them).
    Single-record pages (no real container) match each field page-wide for one row.
    """
    nodes = [_normalize_node(node) for node in dom_nodes if isinstance(node, dict)]
    node_by_id = {node["nodeId"]: node for node in nodes}
    is_single = not container_selector or container_selector == "body"

    fields: list[dict[str, str]] = []
    for pick in picks:
        node_id = pick.get("nodeId", "")
        if node_id not in node_by_id:
            continue
        try:
            generated = (
                generate_selector(dom_nodes, node_id, "node")
                if is_single
                else generate_selector(dom_nodes, node_id, "node", container_selector)
            )
        except ValueError:
            continue  # the picked node isn't inside the container — skip it
        fields.append(
            {"name": pick["name"], "selector": generated["selector"], "extract": pick["extract"]}
        )

    rows: list[dict[str, str]] = []
    if is_single:
        if fields:
            rows = [
                {
                    field["name"]: _snapshot_value(
                        next(iter(_matching_nodes(nodes, field["selector"])), None),
                        field["extract"],
                    )
                    for field in fields
                }
            ]
    else:
        for container in _matching_nodes(nodes, container_selector)[:limit]:
            rows.append(
                {
                    field["name"]: _snapshot_value(
                        next(
                            iter(_matching_descendants(container, nodes, field["selector"])),
                            None,
                        ),
                        field["extract"],
                    )
                    for field in fields
                }
            )
    return {"rows": rows, "fields": fields}


def _snapshot_value(node: dict[str, Any] | None, extract: str) -> str:
    if node is None:
        return ""
    if extract == "href":
        return str(node["attrs"].get("href", ""))
    if extract == "src":
        return str(node["attrs"].get("src", ""))
    return str(node.get("text", ""))  # text / html (the snapshot only carries text)


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

    # Each container's descendants, computed once and reused for every candidate (avoids the
    # O(candidates × containers × nodes) re-derivation that made this slow).
    descendants = _descendants_by_container(container_ids, nodes, node_by_id)
    selected_descendants = descendants[selected_container["nodeId"]]

    scored: list[tuple[tuple[int, int, int], str, str, int]] = []
    for selector, strategy in candidates:
        per_container_counts = [
            len(_select_within(descendants[container["nodeId"]], selector, node_by_id))
            for container in container_nodes
        ]
        if not per_container_counts or per_container_counts[0] < 1:
            continue
        selected_matches = _select_within(selected_descendants, selector, node_by_id)
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
        match_count = len(_select_within(selected_descendants, selector, node_by_id))

    # The relative selector matches one cell per container; surface every match across
    # all containers so the UI can outline the full extracted column (ADR 0007).
    matched_ids = [
        node["nodeId"]
        for container in container_nodes
        for node in _select_within(descendants[container["nodeId"]], selector, node_by_id)
    ]
    return {
        "selector": selector,
        "matchCount": match_count,
        "strategy": strategy,
        "matchedNodeIds": matched_ids,
    }


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
    container: dict[str, Any],
    nodes: list[dict[str, Any]],
    selector: str,
    node_by_id: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    # Build the id map once (was rebuilt per node inside _is_descendant — O(nodes²)); callers
    # in a hot loop can pass a shared one to skip even this.
    ids = node_by_id if node_by_id is not None else {node["nodeId"]: node for node in nodes}
    descendant_nodes = [
        node
        for node in nodes
        if node["nodeId"] != container["nodeId"] and _is_descendant(node, container, ids)
    ]
    return _matching_nodes(descendant_nodes, selector)


def _descendants_by_container(
    container_ids: set[str],
    nodes: list[dict[str, Any]],
    node_by_id: dict[str, dict[str, Any]],
) -> dict[str, list[dict[str, Any]]]:
    # Group every node under each of its container ancestors in ONE pass (O(nodes·depth)),
    # so the relative-selector scoring doesn't re-derive descendants per candidate.
    result: dict[str, list[dict[str, Any]]] = {cid: [] for cid in container_ids}
    for node in nodes:
        parent_id = node.get("parentNodeId")
        current = node_by_id.get(parent_id) if isinstance(parent_id, str) else None
        while current is not None:
            if current["nodeId"] in container_ids:
                result[current["nodeId"]].append(node)
            parent_id = current.get("parentNodeId")
            current = node_by_id.get(parent_id) if isinstance(parent_id, str) else None
    return result


def _select_within(
    subset: list[dict[str, Any]], selector: str, node_by_id: dict[str, dict[str, Any]]
) -> list[dict[str, Any]]:
    # Match a selector against an already-normalized node subset (parse once, no re-normalize).
    segments = [_parse_segment(part.strip()) for part in selector.split(">")]
    if not segments:
        return []
    return [node for node in subset if _matches_selector_chain(node, segments, node_by_id)]


def _is_descendant(
    node: dict[str, Any],
    ancestor: dict[str, Any],
    node_by_id: dict[str, dict[str, Any]],
) -> bool:
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
    raw_attrs = node.get("attrs")
    attrs: dict[Any, Any] = raw_attrs if isinstance(raw_attrs, dict) else {}
    raw_classes = node.get("classes")
    classes: list[Any] = raw_classes if isinstance(raw_classes, list) else []
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

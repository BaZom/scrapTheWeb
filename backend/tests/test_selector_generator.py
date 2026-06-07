from app.selector_generator import generate_selector


def _node(node_id: str, **overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "nodeId": node_id,
        "tag": "div",
        "text": "",
        "attrs": {},
        "classes": [],
        "parentNodeId": None,
        "nthOfType": 1,
        "x": 0.0,
        "y": 0.0,
        "width": 100.0,
        "height": 100.0,
    }
    base.update(overrides)
    return base


def _build_grid(card_count: int = 3) -> list[dict[str, object]]:
    body = _node("body", tag="body")
    root = _node("root", tag="section", classes=["row"], parentNodeId="body")
    cards: list[dict[str, object]] = [body, root]
    for i in range(card_count):
        cards.append(
            _node(
                f"card-{i}",
                tag="article",
                classes=["product_pod"],
                parentNodeId="root",
                nthOfType=i + 1,
            )
        )
    return cards


def test_generates_container_selector_for_repeating_card() -> None:
    nodes = _build_grid(20)
    result = generate_selector(nodes, "card-0", "container")
    assert result["matchCount"] >= 20
    assert "product_pod" in result["selector"]


def test_generates_node_selector_within_container() -> None:
    nodes = _build_grid(3)
    title = _node(
        "title-0",
        tag="h3",
        text="Title",
        parentNodeId="card-0",
        classes=["title"],
    )
    nodes.append(title)
    result = generate_selector(
        nodes, "title-0", "node", container_selector="article.product_pod"
    )
    assert result["selector"]
    assert result["matchCount"] >= 1


def test_container_selector_returns_every_matched_node_id() -> None:
    # The UI outlines exactly these nodes, so they must be the full repeated set,
    # not an approximation, and must agree with matchCount.
    nodes = _build_grid(3)
    result = generate_selector(nodes, "card-1", "container")
    assert set(result["matchedNodeIds"]) == {"card-0", "card-1", "card-2"}
    assert len(result["matchedNodeIds"]) == result["matchCount"]


def test_node_selector_returns_matched_ids_across_containers() -> None:
    # A relative field selector matches one cell per card; matchedNodeIds should
    # cover the cell in every container, so the column outlines across all cards.
    nodes = _build_grid(3)
    for i in range(3):
        nodes.append(
            _node(f"title-{i}", tag="h3", text="Title", parentNodeId=f"card-{i}", classes=["title"])
        )
    result = generate_selector(nodes, "title-0", "node", container_selector="article.product_pod")
    assert set(result["matchedNodeIds"]) == {"title-0", "title-1", "title-2"}

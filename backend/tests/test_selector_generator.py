from app.selector_generator import generate_selector, infer_selector


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


def _mixed_grid() -> list[dict[str, object]]:
    # Two kinds of card under one row: 3 product_pod + 2 featured_pod, all <article>.
    body = _node("body", tag="body")
    root = _node("root", tag="section", classes=["row"], parentNodeId="body")
    nodes: list[dict[str, object]] = [body, root]
    for kind, count, start in (("product_pod", 3, 1), ("featured_pod", 2, 4)):
        prefix = "prod" if kind == "product_pod" else "feat"
        for i in range(count):
            nodes.append(
                _node(
                    f"{prefix}-{i}",
                    tag="article",
                    classes=[kind],
                    parentNodeId="root",
                    nthOfType=start + i,
                )
            )
    return nodes


def test_infer_broadens_to_cover_both_example_kinds() -> None:
    # One example only matches its own class (3 cards); adding a second-kind example must
    # broaden to a selector covering both — here the shared <article> tag (all 5).
    nodes = _mixed_grid()
    assert generate_selector(nodes, "prod-0", "container")["matchCount"] == 3
    result = infer_selector(nodes, ["prod-0", "feat-0"], "container")
    assert result["strategy"] == "inferred"
    matched = set(result["matchedNodeIds"])
    assert {"prod-0", "feat-0"}.issubset(matched)
    assert result["matchCount"] == 5


def test_infer_single_example_matches_generate() -> None:
    nodes = _build_grid(3)
    inferred = infer_selector(nodes, ["card-0"], "container")
    generated = generate_selector(nodes, "card-0", "container")
    assert set(inferred["matchedNodeIds"]) == set(generated["matchedNodeIds"])


def test_infer_relative_matches_cells_across_all_containers() -> None:
    nodes = _build_grid(3)
    for i in range(3):
        nodes.append(
            _node(f"title-{i}", tag="h3", text="Title", parentNodeId=f"card-{i}", classes=["title"])
        )
    result = infer_selector(
        nodes, ["title-0", "title-1"], "node", container_selector="article.product_pod"
    )
    assert set(result["matchedNodeIds"]) == {"title-0", "title-1", "title-2"}

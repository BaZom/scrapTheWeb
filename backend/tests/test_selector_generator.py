from app.selector_generator import generate_selector, preview_from_snapshot


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


def test_preview_from_snapshot_extracts_all_items_from_the_snapshot() -> None:
    # Build + verify a recipe straight from domNodes — no HTML parse (ADR 0009). More than
    # twenty cards catches accidental fixed preview caps; preview returns one row per card.
    nodes = _build_grid(27)
    for i in range(27):
        nodes.append(
            _node(
                f"title-{i}",
                tag="h3",
                text=f"Title {i}",
                parentNodeId=f"card-{i}",
                classes=["title"],
            )
        )
        nodes.append(
            _node(
                f"a-{i}",
                tag="a",
                text=f"Title {i}",
                attrs={"href": f"/p/{i}"},
                parentNodeId=f"card-{i}",
                classes=["lnk"],
            )
        )
    picks = [
        {"nodeId": "title-0", "extract": "text", "name": "title"},
        {"nodeId": "a-0", "extract": "href", "name": "link"},
    ]
    result = preview_from_snapshot(nodes, "article.product_pod", picks)
    assert [f["name"] for f in result["fields"]] == ["title", "link"]
    assert len(result["rows"]) == 27
    assert result["rows"][1]["title"] == "Title 1"
    assert result["rows"][26]["link"] == "/p/26"


def test_relative_selector_prefers_full_coverage_over_partial_stable_class() -> None:
    nodes = _build_grid(27)
    for i in range(27):
        nodes.append(
            _node(
                f"title-{i}",
                tag="h3",
                text=f"Title {i}",
                parentNodeId=f"card-{i}",
                classes=["promo-title"] if i < 6 else [],
            )
        )
    result = preview_from_snapshot(
        nodes,
        "article.product_pod",
        [{"nodeId": "title-0", "extract": "text", "name": "title"}],
    )
    assert len(result["rows"]) == 27
    assert all(row["title"] for row in result["rows"])
    assert result["rows"][26]["title"] == "Title 26"


def test_preview_from_snapshot_single_page_is_one_row() -> None:
    nodes = _build_grid(1)
    nodes.append(_node("h1", tag="h1", text="The Title", parentNodeId="card-0", classes=["t"]))
    picks = [{"nodeId": "h1", "extract": "text", "name": "title"}]
    result = preview_from_snapshot(nodes, "body", picks)
    assert len(result["rows"]) == 1
    assert result["rows"][0]["title"] == "The Title"

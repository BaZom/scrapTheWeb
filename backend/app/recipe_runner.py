from html import escape, unescape
from html.parser import HTMLParser
from typing import Any, Literal

from app.selector_generator import _parse_segment

ExtractType = Literal["text", "href", "src", "attribute", "html"]


class HtmlNode:
    def __init__(self, tag: str, attrs: dict[str, str], parent: "HtmlNode | None" = None) -> None:
        self.tag = tag.lower()
        self.attrs = attrs
        self.parent = parent
        self.children: list[HtmlNode | str] = []

    @property
    def classes(self) -> list[str]:
        return [value for value in self.attrs.get("class", "").split() if value]


class _DocumentParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.root = HtmlNode("document", {})
        self.stack = [self.root]

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        node = HtmlNode(tag, {name: value or "" for name, value in attrs}, self.stack[-1])
        self.stack[-1].children.append(node)
        void_tags = {
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        }
        if tag.lower() not in void_tags:
            self.stack.append(node)

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == lowered:
                del self.stack[index:]
                return

    def handle_data(self, data: str) -> None:
        if data:
            self.stack[-1].children.append(data)


def extract_preview_rows(
    html: str,
    container_selector: str,
    fields: list[dict[str, Any]],
    *,
    limit: int | None = None,
    page_type: str = "listing",
) -> list[dict[str, str]]:
    root = parse_html(html)
    single_page = page_type == "single" or container_selector == "body"
    containers = [root] if single_page else select_nodes(root, container_selector)
    if limit is not None:
        containers = containers[:limit]
    rows: list[dict[str, str]] = []
    for container in containers:
        row: dict[str, str] = {}
        for field in fields:
            name = str(field.get("name", "")).strip()
            selector = str(field.get("selector", "")).strip()
            extract = str(field.get("extract", "")).strip()
            attribute = field.get("attribute")
            if not name or not selector:
                continue
            match = next(iter(select_nodes(container, selector)), None)
            row[name] = _extract_value(
                match,
                extract,
                str(attribute).strip() if attribute is not None else None,
            )
        rows.append(row)
    return rows


def parse_html(html: str) -> HtmlNode:
    parser = _DocumentParser()
    parser.feed(html)
    return parser.root


def select_nodes(root: HtmlNode, selector: str) -> list[HtmlNode]:
    steps = _parse_selector(selector)
    if not steps:
        return []
    current = [root]
    for combinator, segment in steps:
        next_nodes: list[HtmlNode] = []
        for node in current:
            candidates = _element_children(node) if combinator == ">" else _descendants(node)
            next_nodes.extend(candidate for candidate in candidates if _matches(candidate, segment))
        current = _dedupe(next_nodes)
    return current


def _parse_selector(selector: str) -> list[tuple[str, dict[str, Any]]]:
    steps: list[tuple[str, dict[str, Any]]] = []
    token = ""
    combinator = " "
    in_attr = False
    quote: str | None = None
    for char in selector.strip():
        if quote:
            token += char
            if char == quote:
                quote = None
            continue
        if char in {"'", '"'}:
            token += char
            quote = char
            continue
        if char == "[":
            in_attr = True
            token += char
            continue
        if char == "]":
            in_attr = False
            token += char
            continue
        if not in_attr and char == ">":
            if token.strip():
                steps.append((combinator, _parse_segment(token.strip())))
            token = ""
            combinator = ">"
            continue
        if not in_attr and char.isspace():
            if token.strip():
                steps.append((combinator, _parse_segment(token.strip())))
                token = ""
            combinator = " "
            continue
        token += char
    if token.strip():
        steps.append((combinator, _parse_segment(token.strip())))
    return steps


def _matches(node: HtmlNode, segment: dict[str, Any]) -> bool:
    tag = segment["tag"]
    if tag and node.tag != tag:
        return False
    if segment["id"] and node.attrs.get("id") != segment["id"]:
        return False
    if not set(segment["classes"]).issubset(set(node.classes)):
        return False
    for attr, value in segment["attrs"].items():
        if node.attrs.get(attr) != value:
            return False
    nth = segment["nth"]
    return nth is None or _nth_of_type(node) == nth


def _descendants(node: HtmlNode) -> list[HtmlNode]:
    found: list[HtmlNode] = []
    for child in _element_children(node):
        found.append(child)
        found.extend(_descendants(child))
    return found


def _element_children(node: HtmlNode) -> list[HtmlNode]:
    return [child for child in node.children if isinstance(child, HtmlNode)]


def _dedupe(nodes: list[HtmlNode]) -> list[HtmlNode]:
    seen: set[int] = set()
    deduped: list[HtmlNode] = []
    for node in nodes:
        node_id = id(node)
        if node_id not in seen:
            deduped.append(node)
            seen.add(node_id)
    return deduped


def _nth_of_type(node: HtmlNode) -> int:
    if node.parent is None:
        return 1
    siblings = [child for child in _element_children(node.parent) if child.tag == node.tag]
    return siblings.index(node) + 1


def _extract_value(node: HtmlNode | None, extract: str, attribute: str | None) -> str:
    if node is None:
        return ""
    if extract == "text":
        return " ".join(_text_content(node).split())
    if extract == "href":
        return node.attrs.get("href", "")
    if extract == "src":
        return node.attrs.get("src", "")
    if extract == "attribute":
        return node.attrs.get(attribute or "", "")
    if extract == "html":
        return _inner_html(node)
    return ""


def _text_content(node: HtmlNode) -> str:
    parts: list[str] = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
        else:
            parts.append(_text_content(child))
    return unescape("".join(parts))


def _inner_html(node: HtmlNode) -> str:
    return "".join(_serialize(child) for child in node.children)


def _serialize(node: HtmlNode | str) -> str:
    if isinstance(node, str):
        return escape(node, quote=False)
    attrs = "".join(f' {name}="{escape(value, quote=True)}"' for name, value in node.attrs.items())
    if node.tag in {"br", "hr", "img", "input", "meta", "link"}:
        return f"<{node.tag}{attrs}>"
    return f"<{node.tag}{attrs}>{_inner_html(node)}</{node.tag}>"

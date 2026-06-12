from app.recipe_runner import extract_preview_rows

SAMPLE_HTML = """
<html><body>
<section class="row">
  <article class="product_pod">
    <h3><a href="/book-1.html" title="Title 1">Title 1</a></h3>
    <p class="price_color">£10.00</p>
  </article>
  <article class="product_pod">
    <h3><a href="/book-2.html" title="Title 2">Title 2</a></h3>
    <p class="price_color">£20.00</p>
  </article>
</section>
</body></html>
"""


def test_extracts_title_and_price_and_url() -> None:
    rows = extract_preview_rows(
        SAMPLE_HTML,
        "article.product_pod",
        [
            {"name": "title", "selector": "h3 a", "extract": "text"},
            {"name": "url", "selector": "h3 a", "extract": "href"},
            {"name": "price", "selector": "p.price_color", "extract": "text"},
        ],
    )
    assert len(rows) == 2
    assert rows[0]["title"] == "Title 1"
    assert rows[0]["url"] == "/book-1.html"
    assert rows[0]["price"] == "£10.00"


def test_extract_returns_blank_when_field_missing() -> None:
    rows = extract_preview_rows(
        SAMPLE_HTML,
        "article.product_pod",
        [{"name": "missing", "selector": "div.does-not-exist", "extract": "text"}],
    )
    assert rows == [{"missing": ""}, {"missing": ""}]


def test_limit_truncates_rows() -> None:
    rows = extract_preview_rows(
        SAMPLE_HTML,
        "article.product_pod",
        [{"name": "title", "selector": "h3 a", "extract": "text"}],
        limit=1,
    )
    assert len(rows) == 1


def test_single_page_extracts_absolute_field_selectors() -> None:
    rows = extract_preview_rows(
        SAMPLE_HTML,
        "body",
        [
            {
                "name": "title",
                "selector": "html > body > section > article:nth-of-type(1) > h3 > a",
                "extract": "text",
            }
        ],
        page_type="single",
    )
    assert rows == [{"title": "Title 1"}]

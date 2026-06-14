# ADR 0015 — Unify run extraction on the browser engine; render robustness

- **Status:** Accepted
- **Date:** 2026-06-14
- **Scope:** How the saved run extracts rows, and how the page is rendered before capture.
  Backend (`worker.py`, `render_scripts/extract_rows.js`); retires `recipe_runner.py` and the
  dead `/preview` endpoint. Current-truth in `architecture.md` / `builder.md`. Implements the
  diagnosis that was in `docs/backlog/extraction-robustness.md` (now closed).

## Context

The builder mapped fields against the **real browser DOM** (`dom_candidates.js`,
`document.querySelectorAll`), but the saved run re-parsed the fetched HTML with a **hand-rolled
Python `HTMLParser` + CSS matcher** (`recipe_runner.py`). Two engines over two DOM
representations diverge on real HTML — verified against `recipe_runner`:

- **Implicit `<tbody>`:** a selector generated against the browser DOM (`table > tbody > tr`)
  matched **0** rows at run time (browser: 2). Every table-based listing broke outright.
- **Optional-closing `<li>`:** `li:nth-of-type(2)` matched **0** (browser: 1) — `HTMLParser`
  nested the `<li>`s instead of treating them as siblings, so every `nth` was off.
- **Text:** Python `textContent` (hidden text in, no block breaks) ≠ browser `innerText` — the
  same field produced different strings, churning the diff and dedup keys.

A monitoring product whose run disagrees with what the user built is not trustworthy; this was
the gating Phase-0 robustness work.

## Decision

1. **Extract the run in the browser** (`extract_rows.js`, run via `page.evaluate`):
   `querySelectorAll`/`querySelector` + `innerText`/`getAttribute`, the **same engine the
   builder picked against**. Preview and run now agree by construction; malformed HTML is handled
   exactly as a browser handles it. Robust by design — a bad selector yields an empty cell, never
   throws.
2. **Render robustness** in the shared render path: auto-scroll (bounded) to trigger lazy /
   below-fold content before capture, and a best-effort wait for the run's container to attach.
   Auto-scroll is **run-only** — the builder needs a static, top-anchored snapshot or the overlay
   geometry (viewport-relative `getBoundingClientRect`) and field-node budget break.
3. **Retire `recipe_runner.py`** and the **dead `/preview` endpoint** (the frontend used
   `/preview/snapshot`; `previewPageSession` was never called). One run engine, no divergent code.

The fast build **snapshot preview** (`selector_generator.preview_from_snapshot`) stays — it's the
no-fetch picking aid. It can leave empty rows on large pages (node budget), so the preview table
now hides all-empty rows and shows "run to collect all listings" (the run gets them all).

## Rejected alternatives

- **Keep two engines / just fix `recipe_runner`'s parser.** Reimplementing browser HTML
  normalization in Python is a losing game; the browser already does it correctly. Delete it.
- **Raise the node budget to fix preview empties.** A band-aid that doesn't scale to long pages
  and bloats the snapshot payload. The run is already correct; the preview note is enough.
- **Make the preview also extract via the browser now (full WYSIWYG).** The right long-term shape,
  but the preview path has no browser today (only the worker renders) — a larger change deferred
  rather than bundled into this fix.
- **Residential proxies / reaching blocked sites.** Out of scope and rejected (ADR 0012/0013).
  This is a fidelity fix, not a reach-more-sites change; same render, same SSRF/ethics.

## Consequences

- Table listings, optional-close tags, and text now extract correctly on the run — verified in
  real Chromium (`tests/test_extract_rows_browser.py`, skips where no browser binary).
- Less code: the hand-rolled parser + matcher is gone; one engine to reason about.
- **One-time diff churn:** the first run of a sprout that had a prior run on the old engine will
  show new/changed/removed as the corrected row set diffs against the old baseline; it self-corrects.
- Removing `/preview` orphaned `_load_page_session_html` + the `page_html_cache` subsystem (now
  unused at runtime). Left in place as a recorded follow-up (`skrowt-internal-cleanup.md`) rather
  than cascading this change into config/resources/app wiring.
- Auto-scroll adds bounded latency to runs (≤ ~4s on tall pages); negligible on short ones.

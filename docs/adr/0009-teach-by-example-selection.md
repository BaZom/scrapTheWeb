# ADR 0009 — Teach-by-example selection (no-code "click more like this")

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** `backend/app/selector_generator.py`, `backend/app/page_sessions.py`,
  `frontend/lib/api.ts`, `frontend/lib/builder-reducer.ts`,
  `frontend/app/components/builder-view.tsx`, `frontend/app/page.tsx`
- **Builds on:** ADR 0001 (visual picker, auto-advance), ADR 0003 (container candidates),
  ADR 0007 D1 (`matchedNodeIds`), ADR 0006 §2 (uncapped field overlays).

## Context

The picker generates a selector from a **single** clicked node. When that guess is wrong —
it missed some cards, or grabbed the wrong cell for a field — the user had no good fix. The
obvious one (hand-edit the selector) was built and **rejected**: exposing CSS to the
**non-coding** users who are the product's primary target makes the tool feel like it
requires code. The tool must stay click-and-go / "magic."

## Decision

Let users correct a wrong selection the same way they made it — **by clicking another
example**. They click more instances of what they want; the tool infers the pattern that
covers **all** the examples and re-outlines the live match set. No syntax, no CSS.

- **Include-only.** Examples are positive only — "also grab things like this." No negative
  / exclude examples in v1 (one visual state, no red). Covers the common "it missed some."
- **Both items and fields.** Item examples broaden which rows/cards get scraped; field
  examples correct which value is pulled from each card.
- **Happy path untouched.** The first click still auto-generates and auto-advances
  (ADR 0001 D1). Teach-by-example is *progressive* — it only matters when the auto-pick
  missed something, surfaced by a quiet "missed any? click them" nudge next to the count.

### Backend — `infer_selector(dom_nodes, positive_ids, mode, container_selector=None)`

Reuses the **existing** per-node candidate generators (`_stable_attribute_candidates`,
`_class_candidates`, `_tag_candidate`, `_relative_path_candidates`) and matcher
(`_matching_nodes` / `_matching_descendants`) — **no new engine**:

1. Union the `(selector, strategy)` candidates across every example node, de-duped.
2. Keep only candidates that match **all** positive ids (page-wide for items; within each
   example's container for relative fields).
3. Score with the *same* heuristics as `generate_selector` / `_generate_relative_selector`
   (`repeated`/`exact` bonus, overly-broad penalty, `_strategy_rank`, then length), so the
   inferred selector is chosen on the same basis as a generated one. Fall back to a path
   selector when no shared candidate covers every example.

Returns the identical shape (`selector`/`matchCount`/`strategy`/`matchedNodeIds`,
`strategy="inferred"`). **A single example yields the same selector `generate_selector`
would** (tested), so teach-by-example is a pure superset of today's behavior. Exposed via
`POST /{session_id}/selector/infer`.

### Frontend

- **State** (`builder-reducer.ts`): `containerExampleIds` / `fieldExampleIds` track the
  clicked examples; seeded on the first pick, appended on each extra click. Adding an item
  example keeps mapped fields (relative selectors stay valid when the item set widens) but
  clears the preview/save/run. The selector result is set without auto-advancing while
  refining.
- **Items**: in container mode with a selection, clicking an unmatched item adds an example
  and re-infers; examples show as removable chips with a Reset.
- **Fields**: in field mode the overlay set expands from one card's descendants to **all
  matched containers'** descendants (overlays are already uncapped, ADR 0006 §2), so the
  same detail can be clicked in another card; re-infer corrects the column.
- A **plain-language summary** ("Collecting Title, Price, Image from 24 items") keeps the
  user oriented in words, not selectors.

## Alternatives rejected

- **Editable CSS selector** (prior ADR 0009, reverted) — exposes code to non-coders; the
  whole reason this approach exists.
- **Negative / exclude examples** — deferred; doubles the visual language (red state, dual
  meaning of a click) for the less common "grabbed junk" case. Revisit if needed.
- **A "broaden/narrow" slider** — simpler but blunt; it walks selector strategies without
  the user pointing at *what* was missed. Teach-by-example is more direct and precise.
- **A client-side CSS engine to match arbitrary selectors** — same rejection as ADR 0001
  D4 / 0007 D1; unnecessary, since inference composes the in-house candidate vocabulary.

## Concepts to look up

- **Programming by example / inductive selection** — inferring a general rule (selector)
  from a few positive instances; why covering all examples + a simple preference order beats
  asking the user for syntax.
- **Progressive disclosure** — the one-click happy path stays; refinement appears only when
  the result looks incomplete.
- **Single source of truth** — inference reuses the generator's candidate vocabulary and the
  one matcher, so count, outline, and extraction can't diverge.

## Verification

- Backend: `tests/test_selector_generator.py` — two examples broaden the page-wide match to
  cover both kinds; a relative selector inferred from two cells matches the column across all
  cards; a single example equals `generate_selector`. `ruff` clean.
- Frontend: reducer tests for the example actions; `npm test` / `typecheck` / `lint`.
- Manual: a list page where the auto-pick misses cards → click a missed card → count +
  outline grow, no CSS shown; add a field example from another card → column corrects; the
  one-click happy path is unchanged.

---

## Follow-up round (2026-06-09) — usability fixes from first walkthrough

Four issues surfaced reviewing the first cut. Recorded here because they shape the same
no-code selection surface.

### 1. Adding missed items was broken (bug)

The first item pick auto-advances to **Details (field) mode** (ADR 0001 D1), but adding a
missed item only made sense in **Item mode** — so clicking a missed card was interpreted as
a *field* pick and the relative-selector path raised "node not inside the selected
container." The "click missed items" nudge therefore led into an error.

**Fix.** Mode is now explicit in the refine loop: once an item is picked the canvas shows
clickable **node overlays** (not the candidate cards) with the matched set outlined, so any
missed card is clickable; the Item card shows **"Missed some items? Add them"** (switches to
Item mode) and a **Done** button back to Details. `showCandidates` is gated on
`!selectorResult` so candidate cards help only the first pick; the group outline is
restricted to field mode to avoid doubling the node-overlay matched outline.

**Second fix — freeze detected items.** The first cut guarded the add only on
`matchedNodeIds.has(node)`, which is true only for the *card itself*. Clicking a **child
element inside** an already-detected card (its title, price, …) slipped through and was
added as a bogus item, broadening the selector to garbage. Now the guard uses
`matchedContainerIdOf(node)` (walk up to a matched-container ancestor): a click on, or
**anywhere inside**, a detected item is ignored — the detected set is *frozen*. Visually,
frozen nodes don't hover-highlight and show a default cursor, so only genuinely-missed
regions (outside every card) invite a click. This is the "freeze the items already detected
so the missed ones can be added" behavior.

### 2. List/single detection — no new logic

Confirmed already handled: render-time candidate scoring picks list vs single
(`STRONG_CANDIDATE_SCORE`, ADR 0005) with the manual toggle as override. Recorded so it
isn't re-investigated.

### 3 + 4 + 5. "What to collect" picker — friendly, present-only, multi-value

The extract control exposed developer vocabulary (`text/href/src/attribute/html`), offered
options that are empty for the element, and allowed only **one** value per element.

**Decision.** Replace the dropdown + raw attribute box with **tickable, friendly options
showing only values present on the clicked element** — **Text / Link / Image** — derived
client-side from the DOM node (`text`, `attrs.href`, `attrs.src`, all already captured by
the render script). Ticking several takes **multiple values from one element** (a linked
title → a Text field *and* a Link field): the first ticked extract keeps the typed name,
extras get a readable suffix (`_link` / `_image`). New `fields_added` reducer action commits
the set atomically (dedupe by name, clear the editor). The live sample tracks the first
("primary") tick. `html` and the generic free-text `attribute` are dropped from the UI (the
backend still supports them; they're just not surfaced to non-coders).

### Live preview as you build

To let users *judge* a field by its values rather than its selector, the results table now
**auto-extracts (debounced, cancellable)** whenever the item selector or field set changes —
no manual Preview click. Errors stay silent here (the manual Preview button surfaces them).
Repeat extractions are cheap via the page-session HTML cache (ADR 0008) — the synergy that
ADR motivated.

**Why these belong together:** all four serve the standing product rule (CLAUDE.md) that the
builder stays click-and-go for **non-coders** — no CSS, no developer terms, no empty
choices, and immediate visible feedback.

**Rejected / deferred:** exclude (negative) examples; a per-card confidence strip in the
field editor; multi-value naming the user can edit before commit (auto-suffix is enough for
v1). Known debt: `fieldAttribute` / `onFieldAttributeChange` props are now unused (attribute
UI removed) — prune in a later cleanup.

### Preview UX + layout — one item while building, full table on demand

The first cut auto-extracted and showed the **whole** records table inline. Two problems for
non-coders: the big table dominated, and judging a field meant reading a grid. Also the page
screenshot took most of the width with lots of empty space, and the records lived in a bottom
panel.

**Decision.**
- **One item while building.** The right panel shows just the **first matched item's**
  field → value list (live, fed by the debounced auto-extract; cheap on repeat via the
  ADR 0008 cache). Enough to confirm "title = the right thing" without a table.
- **Full table on demand.** "Preview records" toggles the right panel to a compact
  all-records table (and back to one item). No bottom table during build.
- **Roomier layout.** The screenshot is capped narrower (`maxWidth` 1180 → 760) and the
  right assistant panel widened (360 → 440), so the page view stops hogging space and the
  data sits beside it.
- **Results panel is post-run only.** The bottom panel (records / changes / logs + export)
  now renders only once a run exists; during build there's no bottom panel, matching the
  "data on the right" layout.

**Rejected:** a backend "limit to N rows" param for the one-item preview — the cache already
makes extracting all rows cheap, and showing `rows[0]` needs no API change; revisit only if
extraction of huge pages is felt.

### Auto-discover a card's fields (replaces cross-card field picking)

The cross-card field flow (click the same detail in another card) was confusing — after
picking an item the user was pushed to pick fields *across all matched cards*. What's wanted
is the opposite: **click one card → see its fields, with values, and tick what to keep.**

**Decision.** When an item is selected (list shape), enumerate the card's extractable values
**client-side** from `domNodes` (descendants of `selectedNode`) and show a **"Fields in this
item" table** in the right panel — each row a candidate (`[✓] name | value | Text/Link/Image`):
- **Text** = innermost text holder (text present, no descendant within the card also has
  text) — the title `<h2>`, the price `<span>`, not the wrapping div.
- **Link** = `<a>` with `href`; **Image** = `<img>` with `src`. A linked title offers both.
- Suggested names from `itemprop` / `data-testid` / `aria-label` / a meaningful class token,
  else generic; editable. De-duped by value, ordered by position, capped at 15.

Ticking + "Add selected fields" generates each one's **relative selector** via the existing
`/selector` flow (parallel) and commits them with `fields_added` (its `fieldSelector` guard
was dropped — a batch add carries its own selectors). The cross-card overlay expansion and
its `field_example_added` / `field_selector_inferred` usage are removed; field-mode overlays
revert to the **single selected card**, where a manual click is the fallback for anything the
discovery missed. Single-record pages keep the manual picker (their "card" is the whole body).

**Rejected:** auto-adding all discovered fields (the user should choose); a backend
field-detector (client-side enumeration over the captured DOM nodes is enough and instant).

### Concepts to look up (follow-up)

- **Mode affordances** — when a single canvas serves two intents (pick items vs map fields),
  make the active intent explicit rather than overloading a click by position.
- **Capability-derived UI** — generating the choices from the data actually present
  (present attributes) instead of a fixed menu, so empty/irrelevant options never show.
- **Optimistic/auto feedback loops** — debounced auto-preview as a "see it as you build"
  surface, and why it must be cancellable (stale-response race, ADR 0001 D5).

### Verification (follow-up)

- Frontend: new `fields_added` reducer tests (multi-field from one element, dedupe, no-op
  without selector); `npm test` (37), `typecheck`, `lint` clean.
- Manual (pending live-stack pass): missed-item add via the mode switch; tick Text+Link on a
  linked title → two fields; table auto-populates on field/selector change.

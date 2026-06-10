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
- **Roomier layout (corrected).** First attempt shrank the *screenshot image*
  (`maxWidth` 760) — wrong lever, leaving empty gutters around a small image. Corrected:
  resize the **windows** — the screenshot fills its pane (`width: 100%`, no inner cap) and
  the right assistant panel is widened (`minmax(440px, 560px)`), so space is shared between a
  roomy data panel and a gutter-free page view.
- **Results panel stays.** The bottom panel (records table / changes / logs + export) renders
  as before (an earlier change to hide it until a run was reverted at the user's request —
  the full records table + Changes/Logs tabs are wanted visible).

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

### Final field workflow — one selection, explicit preview

Iterating on the field step surfaced the intended flow (user's spec): pick an item → see that
one item's data in a table → select fields from the table **or** the screenshot (no conflict)
→ nothing extracts until an explicit "Preview records", which then fills the bottom panel
with all matched items.

**Decision.**
- **One shared selection** — a `selectedKeys` set (`nodeId:extract`). The discovery table's
  checkboxes and on-screenshot clicks both toggle the *same* set (`toggleFieldKey`), so the
  two input methods can't disagree. The screenshot also reflects the selection (a clicked,
  selected value is highlighted), and the working card gets a bold "Editing this item"
  spotlight so it's unmistakable.
- **Current item only** — candidates come from the selected card's descendants; values are
  the card's own DOM values. No reading across matched items.
- **No auto-preview** — the debounced auto-extract effect is removed; selecting is instant
  and client-side. The earlier right-panel one-item/records toggle is gone too.
- **"Preview records" is the only extraction** — it generates each selected candidate's
  relative selector (parallel, `/selector`), commits them as the recipe `fields`, extracts
  all matched items, and shows them in the **bottom panel**. Save uses those fields.
- **Removed the conflicting path** — the separate `fieldSelector` "What to collect" editor
  (which swapped out the table on a screenshot click) is deleted; clicks now just toggle the
  shared selection. The raw CSS selector is shown nowhere.

**Rejected:** committing fields on every tick (would either fire a backend call per tick or
desync) — deferring selector generation + extraction to the explicit "Preview records" click
matches the spec (selecting ≠ previewing) and keeps selecting instant.

### Field workflow refinements — single pages, multi-attribute, save gating

Three fixes after the first cut of the one-selection workflow:

- **Single-record pages worked via clicks (regression fix).** Auto-discovery is scoped to a
  selected *card*, which single pages don't have — so they'd lost field selection entirely.
  Now clicking any value on a single page adds its attribute rows to the table (page-wide),
  and "Preview records" generates **page-wide unique** selectors (`single: true`) instead of
  container-relative ones. Discovery stays list-only; single relies on clicks.
- **One element → choose among its attributes (group rows, tick multiple).** Clicking an
  element no longer auto-picks one attribute. It surfaces **all** of that element's
  extractable values (Text / Link / Image) as rows and **highlights them together**; the user
  ticks any/all — each ticked attribute becomes its own field (e.g. a linked title →
  `title` + `title_link`). Implemented via a shared `candidatesForNode` helper (used by both
  discovery and clicks), `clickedCandidates` (rows added by clicking), and `focusedNodeId`
  (the highlighted group). The table merges discovered + clicked candidates into `allCandidates`.
- **Save after preview.** "Save recipe" (which creates the recipe in the DB — the only write,
  see CLAUDE.md data-flow) is disabled until a preview exists, so the user always sees the
  extracted data before committing. "Preview records" remains a no-write dry-run.

### Field management lives in the preview table, not a side list

The right panel previously showed a second list — one card per committed field — *under* the
selection table. Redundant. Removed it. Fields are now managed where you see them: each
column in the **preview records table** has an **×** to remove that field. Removal uses a new
`field_removed` action that drops the field **without clearing the preview** (the other
columns' data is still valid — unlike `fields_changed`), and also unticks the field's source
candidate so it won't return on the next preview. Adding stays via the selection table /
screenshot. Field names are deduped in the component (`selectedFieldPicks`) so the committed
column name maps back to its candidate for the untick.

### Fast preview from the render snapshot (not a re-parse)

"Preview records" was slow because it (a) generated one selector per field (N round-trips)
and (b) **re-parsed the entire page HTML** on the backend every time (the ADR 0008 cache
stores raw HTML, not the parsed tree). Yet the render already captured every element's
text/href/src into `domNodes`, which lives in the browser and in Redis — so for *building and
verifying* a recipe against this one example page, the data is already available.

**Decision.** Preview extracts straight from the snapshot. A single endpoint
`POST /{id}/preview/snapshot` takes the selected picks (`{nodeId, extract, name}`),
`preview_from_snapshot` (in `selector_generator.py`, reusing the matcher that already
produces the match counts) generates each field's selector and reads its value from
`domNodes` over every matched item, and returns `{rows, fields}`. **One round-trip, no S3
fetch, no HTML parse, no N selector calls.** The frontend commits the returned fields and
shows the rows in the bottom panel.

**Fidelity tradeoff (deliberate, accepted by the user).** The snapshot is a *verification*
view: text is capped at ~160 chars and it uses the snapshot matcher rather than the run's
HTML matcher. That's fine because the render is **example data to build + verify the
recipe** — the **saved run still extracts from freshly-fetched HTML** (`recipe_runner`,
unchanged), which is where full fidelity and real data matter. Preview answers "did I pick
the right things?"; the run answers "what's actually on the live site now?"

**The actual bottleneck (found by profiling, not guessing):** it wasn't the HTML parse at
all — it was `generate_selector` in **relative** mode. `_is_descendant` rebuilt the full
`nodeId → node` map on every call, so `_matching_descendants` was **O(nodes²)**, and the
relative scoring called it **candidates × containers** times. On a 600-node page one relative
selector took ~2.6 s; a 3-field preview took ~8 s. Two behaviour-preserving fixes (49 tests
unchanged): (1) build the id map once and pass it to `_is_descendant` (O(nodes²) → O(nodes·
depth)); (2) precompute each container's descendants **once per call** and match candidates
against them (`_descendants_by_container` + `_select_within`), removing the candidates factor.
Result: 8 s → ~16 ms (50 cards), ~2 s → ~67 ms (200 cards). The snapshot path then has nothing
heavy left.

**Rejected:** caching the parsed DOM tree (ADR 0008's deferred follow-up) — it would speed
the re-parse but keep the N selector calls and the S3 dependency; extracting from the
snapshot removes all three at once. Client-side extraction in the browser — rejected for the
same reason as ADR 0001 D4: no CSS engine on the flat node list; the backend matcher is
authoritative and already exists.

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

## Follow-up 3 (2026-06-10) — retire missed-item inference

The add-missed-items interaction added complexity before the core builder flow had settled. The
user asked to remove it entirely for now. The current builder keeps the no-code first-pick flow:
click one item, generate the repeated selector, then choose fields. If the pick is wrong, the
user can return to Item mode and pick a different item; broadening a selector with extra
positive examples is not available.

Decision:

- Removed frontend state/actions for `containerExampleIds`, `container_example_added`, and
  `container_selector_inferred`.
- Removed the frontend `inferSelector` API client and page-level `handleAddItemExample` /
  reset handlers.
- Removed the backend `POST /api/page-sessions/{id}/selector/infer` endpoint and the
  `infer_selector` helper.
- Removed the stale missed-items backlog bug because the feature it described no longer exists.

Preserved: first-pick selector generation, matched-node outlines, field selection, snapshot
preview, save, and run behavior.

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

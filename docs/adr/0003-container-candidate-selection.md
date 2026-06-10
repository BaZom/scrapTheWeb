# ADR 0003 — Semantic container-candidate selection in the builder

- **Status:** Accepted / implemented
- **Date:** 2026-05-31
- **Scope:** `backend/app/worker.py`, `backend/app/page_sessions.py`,
  `frontend/lib/api.ts`, `frontend/app/components/builder-view.tsx`
- **Builds on:** ADR 0001 (Phase 1 builder UX). Independent of the cookie/overlay
  dismissal work (`overlay_reduction`), which it leaves untouched.

## Problem

On marketplace listing pages (e.g. `kleinanzeigen.de/s-autos/c216`) Container mode
was unusable. The picker took the raw visible DOM rectangles, **sorted largest-first**,
and showed the 220 biggest boxes. The biggest boxes are the page wrapper, the results
column, the sidebar — *not* the repeated listing cards. Users kept selecting a layout
container instead of a single car listing, so field mapping then had nothing useful to
map against.

## Decision

Detect the repeated "listing card" elements **semantically, in the browser, at render
time**, score them, and make those scored candidates the primary thing Container mode
offers. The frozen-screenshot + DOM-overlay architecture is unchanged.

### Why this and not the obvious alternatives

| Alternative | Why rejected |
|---|---|
| **Raise the DOM node cap / show more overlays** | More boxes ≠ better boxes. The wrappers are still the biggest; the user still can't tell a card from the results column. Treats a *ranking* problem as a *quantity* problem. |
| **Render the live site in an iframe and let users click real elements** | Cross-origin pages can't be scripted in an iframe; re-introduces consent popups, layout shifts, and non-determinism. The whole point of the frozen screenshot is a stable, inspectable snapshot. |
| **Cookie storage / persistent consent / manual "Setup" click mode** | Out of scope and orthogonal — consent is already handled. Doesn't address *which element* to pick. |
| **Semantic candidate scoring (chosen)** | Encodes what a human sees — "those repeated cards" — as features the machine can rank. Spends the limited node budget where it matters. |

### How candidates are detected (`worker.py`, `_DOM_AND_CANDIDATES_JS`)

In the same `page.evaluate` that builds `domNodes`, over the **full** visible element
set (before truncation):

1. **Group repeated siblings.** Each visible element gets a signature of
   `tag + normalized top classes` (digits collapsed to `#` so `item-12`/`item-13`
   share a signature). Elements are grouped by `(parentIndex, signature)`. A group with
   ≥3 members is a repetition — the core signal that something is a list.
2. **Score each group** (higher = more listing-card-like):
   - `+` repetition count (capped), `article`/`li`/`tr` tags, class keywords
     (`item|card|result|listing|product|tile|offer|…`)
   - `+` contains a detail link (generic shape only — a long numeric id `\d{6,}`, a
     slug ending in an id `[/_-]\d{4,}`, or a generic segment like `/item|/product|
     /listing|/detail`; **no site-specific tokens**), price-like text
     (`€ $ £`, `1.299,-`, `\d+[.,]\d{2}`), a title (`h1–h4`/`[class*=title]`), an image
   - `+` "card-sized" dimensions
   - `−` chrome keywords (`header|nav|footer|sidebar|filter|cookie|consent|…`),
     **huge wrappers** (cover >90% width & >60% height → −22), full-height columns,
     too-small slivers
3. Keep the **top 5 groups**; emit each member as a candidate with `nodeId`, bounds,
   `label`, `score`, `reason`, `matchCount`, and a shared `group` key.

**Generality (works on any website).** Nothing keys off a domain, selector, or brand.
The load-bearing signal is *structural* — repeated sibling elements — which is how every
listing/marketplace/search/feed page is built, regardless of language or framework. The
keyword and detail-link signals are **additive bonuses, never requirements**: a page
whose class names are non-English or opaque still gets detected via repetition + price /
title / image / dimensions. There are no site-specific tokens; the detail-link signal is
the generic shape of a detail URL (a long numeric id or a generic path segment), so it
spans marketplaces rather than encoding one.

### Candidate-aware truncation (the subtle part)

> **Updated by ADR 0006:** this candidate-priority truncation now runs **only when a
> strong candidate is present (score ≥ 40 → a list page)**. On single/unstructured
> pages it would crowd out the item's main content, so those keep plain document order.
> `MAX_DOM_NODES` was also raised 500 → 900 for headroom.

When a strong candidate is present, truncation *prioritizes the listing subtree*: it
keeps candidate nodes, their ancestors, and their descendants first, then fills the
remainder in document order. This guarantees two invariants the rest of the flow
depends on:

- A selected candidate's `nodeId` exists in `domNodes` → the existing
  `/selector` endpoint works unchanged (no selector-generation change was needed).
- A selected card's descendants exist in `domNodes` → Field mode (which restricts
  overlays to descendants of the selected container) has real nodes to offer.

Because `nodeId` is the document index, the id space is shared between `domNodes` and
`candidates` for free.

### Frontend (`builder-view.tsx`)

- Container mode renders **candidate overlays** (visible dashed teal boxes, all cards
  obviously clickable) instead of the largest raw rectangles. Selecting one maps the
  candidate to its `DomNode` and calls the same `onNodeSelect` path.
- After selection, the **exact** repeated group is outlined using the candidates'
  shared `group` key — replacing the old tag/class client-side approximation
  (ADR 0001, Decision 4) whenever candidates are present. The outline persists into
  Field mode via a non-interactive layer, so the matched set stays visible.
- The **Nodes** tree view is unchanged and remains the manual/advanced fallback;
  Field mode still restricts selectable nodes to descendants of the selected container.
- If the backend returns no candidates, Container mode falls back to the previous
  raw-overlay behavior — nothing regresses on pages without a clear repetition.

### API contract

`containerCandidates` added to the page-session response — backend Pydantic
(`ContainerCandidate`, with a `_normalize_candidate` coercion step mirroring
`_normalize_dom_node`) and frontend Zod (`containerCandidateSchema`), both defaulting
to `[]`. `domNodes` is retained for field mapping and the advanced fallback.

## Concepts to look up

- **Repeated-sibling / structural repetition detection** — the foundation of nearly
  every "auto-detect the list" scraper (cf. MDR, web data extraction wrappers).
- **Semantic vs. geometric ranking** — why "biggest box" is the wrong prior and
  feature scoring (links, price, repetition, dimensions) is the right one.
- **Container-vs-field picking** — the two-level mental model: pick the repeating unit,
  then map fields *relative to* it; why field selectors must be container-scoped.
- **Why huge layout wrappers must be penalized** — they technically "contain" the data
  but extract to one giant row; the unit of repetition is the card, not the column.
- **Budgeted DOM serialization** — keeping the *relevant* subtree under a fixed node cap
  beats raising the cap (payload size, render cost, overlay noise all stay bounded).

## Verification

- Backend: `python -m py_compile app/worker.py app/page_sessions.py` — passes.
- Frontend: `npm run typecheck` and `npm run lint` — pass (only the pre-existing
  `layout.tsx` custom-font warning remains).
- `ruff` and `pytest` are **not installed in this environment**, so backend lint/tests
  were not run here. The in-page JS (`_DOM_AND_CANDIDATES_JS`) cannot be exercised
  without a live browser; it is covered by manual testing per the task constraints.

## Follow-ups (not done here)

- Return matched `nodeId`s straight from the `/selector` endpoint so even the
  non-candidate fallback gets exact highlighting (retires the last approximation).
- Optionally expose `score`/`reason` in the inspector so power users see *why* a card
  ranked where it did.
- Pure-function unit tests for the scoring heuristic once it's extracted from the
  in-page JS into a testable shape (e.g. a JS module run under a DOM test runner).

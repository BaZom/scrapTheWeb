# ADR 0005 — Universal, non-coder builder flow

- **Status:** Accepted / implemented
- **Date:** 2026-05-31
- **Scope:** `frontend/app/page.tsx`, `frontend/app/components/builder-view.tsx`,
  `frontend/lib/api.ts`
- **Builds on:** ADR 0001 (Phase 1 UX) and ADR 0003 (container candidates).
- **Backend changes:** none. (Verified the existing selector generator + extractor
  already support the single-record path — see "Verification".)

## Problem

The builder was usable only by someone who understood developer concepts: two
toggles (**Boxes/Nodes** and **Container/Field**) and jargon ("container", "field",
"nodes"). Worse, it implicitly assumed **every page is a listing of repeated cards**.
A single-record page (one product, one article) had no first-class flow, and the DOM
tree was a top-level option a non-coder would never use. The goal: **work on any
website, usable by a non-coder.**

## Decision

Auto-detect the page **shape** and drive a guided, plain-language flow, with the
power-user surface tucked away — never removed.

### Three selection layers (ordered by frequency, all always available)

1. **List + candidates** — repeated items detected → hover-highlight, "click one
   example," matched group outlines, auto-advance to details. (ADR 0003)
2. **General manual** — hover-click *any* element. The universal floor that makes the
   tool work on pages with no clean structure.
3. **Advanced (DOM tree)** — moved behind an "Advanced" toggle, not a top-level chip.

### Auto-detected shape (no toggle for the user)

On render, `page.tsx` sets `recipeShape` from the **strength** of the backend
candidates (kept automatic — no user-facing toggle, to stay simple for non-coders):
- a candidate group with **score ≥ 40** present → **list** (many records)
- otherwise → **single** (one record)

Gating on score (not mere presence) matters: a single-item *detail* page (one car) has
incidental repeats — spec `<li>` lists, image galleries, "similar/trade-in" sections —
that produce dozens of low-scoring candidates (observed max ≈ 33), whereas a real
listing's cards score ≈ 55+. Counting presence alone mis-detected detail pages as lists
and trapped the user on the wrong repeated elements (candidate overlays replace general
selection in list mode). The score gate fixes the common case; the **Advanced (DOM
tree)** view remains the manual fallback if a page is mis-detected.

**Single-record flow** skips the "pick an item" step entirely: the whole page **body
is the record**, so the user goes straight to choosing details. Implementation —
reuses the existing pipeline with no backend change:
- container is set to the synthetic selector `body` (matches once → one row);
- field selectors are generated **page-wide unique** via
  `generateSelector(..., { single: true })` → backend `mode="node"` with no container
  (relative selectors against `body` would fail, since `body` isn't in `domNodes`);
- saved with `pageType: "single"`.

If detection is wrong (a real list comes back with no candidates), it degrades
gracefully: the user can still pick a repeating item via the general manual layer.

### Plain language

| Before | After |
|---|---|
| Container | **Item** (hidden entirely in single mode) |
| Field | **Detail / Details to collect** |
| Boxes / Nodes toggle | **Advanced** toggle (visual is default) |
| "Pick a container in the canvas" | "Click an example item" / "Click the details to collect" |
| Stepper: Load URL → Select container → Map fields → … | List: Load page → Pick an item → Choose details → Preview → Save · Single: Load page → Choose details → Preview → Save |

Hover-only highlighting (no upfront clutter) and the post-selection matched-group
outline are preserved.

## What stays generic

- No domain/selector/site tokens. Shape detection is purely structural (candidate
  presence, itself language-agnostic).
- The general manual layer works on any DOM, any language, any framework.
- Single-record support is mechanism, not heuristics: body-as-container + unique
  selectors works for any one-record page.

## Verification

- Frontend `typecheck` + `lint` pass (only the pre-existing `layout.tsx` font warning).
- Single-record path exercised against the **real** backend modules on a sample page:
  `generate_selector(mode="node", container=None)` → `h1` (matchCount 1),
  `p.price_color` (matchCount 1); `extract_preview_rows(html, "body", fields)` →
  `[{title: "A Light in the Attic", price: "£51.77"}]`. Confirms unique selectors +
  body container yield exactly one correct record.
- `ruff`/`pytest` unavailable in this environment (no backend changes this round
  anyway).

## Trade-offs / risks

- **Single mode uses the first page-wide match** per field. Correct for one-record
  pages; if a field selector isn't unique, the first match wins (shown immediately in
  preview).
- **Mis-detection** (list page with no detected candidates → treated as single) is
  recoverable via the manual layer, not a hard failure.
- The Container/Field toggle still exists in **list** mode (renamed Item/Details) for
  users who want to re-pick; it's only hidden in single mode.

## Follow-ups (not done)

- A dedicated backend single-record renderer (body-as-container is sufficient for v1).
- Multilingual consent/keyword coverage (tracked separately).
- ~~Letting the user override the detected shape from the UI~~ — **done**, see the
  follow-up below.

## Follow-up — manual shape override (2026-06-08)

Auto-detection (score gate above) is right for the common case but can still misfire: a
single-item **detail** page with an incidental repeated strip that scores ≥ 40 (e.g. a
kleinanzeigen ad with a "similar ads" row) is read as a **list**, trapping the user in
container mode where the candidate overlays replace general selection — preview then
extracts the wrong repeats. The DOM-tree fallback existed but is a power-user escape, not
a fix for "the tool guessed the wrong shape."

**Decision.** A first-class **Page: List / Single** toggle in the builder controls
(frontend-only — `frontend/app/components/builder-view.tsx`), wired through a new
`shape_changed` reducer action (`frontend/lib/builder-reducer.ts`, tested). Auto-detection
still seeds the initial shape; the toggle lets the user correct it.

- **Reducer.** `shape_changed` reuses the same `shapeFlow(shape)` helper as
  `render_succeeded`, so manual and automatic shape selection set the identical slices and
  can't drift (single → synthetic `body` selector + field mode; list → no selector +
  container mode). Because field-selector **semantics differ by shape** (list selectors are
  relative to the chosen item; single selectors are page-wide unique — see "Single-record
  flow" above), kept fields would be wrong after a flip, so the action clears the whole
  downstream flow (selection, fields, samples, preview, saved recipe, run). It's a no-op
  when the shape is unchanged, so an accidental click on the active segment costs nothing.
- **Persistence.** `recipeShape` is already part of the draft's structural key (ADR 0007),
  so an override persists immediately and survives a reload.

**Rejected:** a confirm dialog before clearing the mapping — the flip is a deliberate,
explicit action and the cleared state is trivially rebuilt; a prompt every time would be
friction. Also rejected: trying to *migrate* existing fields across the flip — relative and
page-wide selectors aren't interchangeable, so a "kept" field would silently mismatch.

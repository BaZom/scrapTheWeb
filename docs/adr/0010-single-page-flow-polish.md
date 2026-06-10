# ADR 0010 — Single (detail) page builder-flow polish + fields-table select-all

- **Status:** Accepted
- **Date:** 2026-06-10
- **Scope:** `frontend/app/components/builder-view.tsx` (the `recipeShape === "single"`
  branches of the right inspector panel, plus the fields-table header — both shapes;
  frontend-only)
- **Builds on:** ADR 0005 (shape detection: list vs single) and ADR 0009 (teach-by-example,
  no-code builder). Closes the **single-flow** half of `docs/backlog/ux-polish.md`.

## Context

The single/detail-page flow (no repeating card; the user clicks values page-wide to add
fields) was *functional* but read as rougher than the list flow:

- The right inspector opened straight into an empty fields card. List mode anchors the panel
  with an "Item" block (match count, "Editing this item" spotlight); single mode had no
  equivalent "what is this / what do I do" header.
- The only "nothing picked yet" hint was a single line of text buried in the fields card —
  not a real empty state with an affordance.
- A leftover "Tip" still told users to *"switch the extraction type if you need `href`,
  `src`, or a custom attribute."* That UI was removed in ADR 0009; the copy was both dead
  and a direct violation of the standing **no-code** principle (no `href`/`src`/regex/CSS
  terms in the default builder).

## Decision

Three frontend-only changes to the single branches, no new logic or props:

1. **Single-page anchor** — a "Page" block at the top of the inspector mirroring the list
   "Item" block: an uppercase `Page` label, a `Detail page` / `N details` badge, a `file`
   icon + "Collecting from this page", and a one-line instruction ("This page is one record.
   Click each value you want…"). Gives the flow parity with list mode.
2. **Real empty state** — when no values are picked yet, the fields card shows a dashed
   `EmptyState` with a `cursor` icon and "Click a value on the page … its options (Text /
   Link / Image) appear here to tick", instead of a one-liner.
3. **On-message Tip** — the stale tip is replaced with shape-aware copy that names only
   Text/Link/Image (single: "click each value… a linked title grabs text and link
   together"; list: "tick Text, Link, or Image — take several from one element").
4. **Fields-table "Select all"** (both shapes) — a header checkbox toggles every candidate
   row at once, with an indeterminate state when only some are ticked and a live
   `selected/total` count. Operates only on the current `allCandidates`, so it never touches
   selection keys that are no longer offered (e.g. after switching items). Drives the same
   shared `selectedKeys` as the per-row checkboxes and the on-screenshot clicks.

## Rejected alternatives

- **A single-mode canvas spotlight** (like list's "Editing this item" overlay): rejected —
  on a detail page the whole page *is* the record, so dimming everything-but-one-box would
  fight the "click anything" model. The anchor lives in the panel, not the canvas.
- **Removing the Tip entirely:** kept a tip, but rewritten — the affordance is still useful
  for the multi-value (text+link) case; only the dev-term copy was the problem.

## Concepts to look up

- Progressive disclosure / empty-state affordances; "show the next action" UI patterns.

## Status

Automated checks green (typecheck / Vitest / `next lint` / `next build`). Live-stack manual
eyeball still recommended (layout proportions on a real detail page). The **icon & spacing**
half of `ux-polish.md` remains open.

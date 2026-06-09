# Planned — builder UX polish

**Status:** planned · **Area:** builder UI

## Single-item (detail) page design & UX
The single-page flow (no repeating card; the user clicks values page-wide to add fields) is
functional but rougher than the list flow. Give it a deliberate layout + affordance pass so
it reads as intentionally as list mode — clear "what do I click?" guidance, a sensible empty
state, and parity with the list-mode fields table.

- Touches `frontend/app/components/builder-view.tsx` (the `recipeShape === "single"` branches)
  and the field-selection/empty-state UI.

## Icon & spacing pass
Tighten icon sizing/pacing, spacing rhythm, and visual consistency across the builder —
buttons, badges, the fields table, the item card, and the bottom results panel.

- Touches `frontend/app/components/builder-view.tsx`, `ui.tsx`, `icons.tsx`.

## Notes
Keep the non-coder design principle (no CSS/code-shaped inputs; click/tick/toggle only — see
`docs/reference/builder.md` §2).

# Planned — builder UX polish

**Status:** in progress (single-flow DONE, icon/spacing OPEN) · **Area:** builder UI

## Single-item (detail) page design & UX — DONE (ADR 0010)
The single-page flow (no repeating card; the user clicks values page-wide to add fields) was
functional but rougher than the list flow. Shipped a deliberate layout + affordance pass:
a **"Page" anchor** in the inspector (parity with the list "Item" block), a real fields-card
**empty state**, and an **on-message Tip** (dropped the dead `href`/`src`/attribute copy).
Frontend-only, in `builder-view.tsx` single branches. See `docs/reference/builder.md` §1.4.
Live-stack manual eyeball still recommended.

## Icon & spacing pass
Tighten icon sizing/pacing, spacing rhythm, and visual consistency across the builder —
buttons, badges, the fields table, the item card, and the bottom results panel.

- Touches `frontend/app/components/builder-view.tsx`, `ui.tsx`, `icons.tsx`.

## Notes
Keep the non-coder design principle (no CSS/code-shaped inputs; click/tick/toggle only — see
`docs/reference/builder.md` §2).

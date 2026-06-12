# Builder UI enhancements (post-redesign polish)

## Summary

A small batch of builder refinements requested after the Harvestly redesign (ADR 0011).
Frontend-only UX polish — no extraction/API changes expected.

## Items

### 1. Polish the preview-records table

The bottom **Preview records** table is functional but wants a visual/UX pass so it matches the
Harvestly mono look and reads cleanly:

- Column sizing / alignment (avoid overly wide or cramped columns; sensible min/max widths).
- Value truncation + tooltips for long values; keep the row height calm.
- Header styling (the field name + type chip) consistent with the monochrome theme.
- Clear empty / loading states (loading already uses `animated-data-flow-to-table.svg`).
- Image/link cells: render thumbnails / shortened links nicely rather than raw URLs.
- Keep the per-column remove (×) affordance discoverable.

Touches: the preview table block in `frontend/app/components/builder-view.tsx` and `.tbl`
styles in `globals.css`.

### 2. Remove dead code in the builder (next time)

The redesign + the missed-item removal (ADR 0009 FU3) left several `BuilderProps` that are no
longer referenced in `builder-view.tsx` — clean these up and trace them back through
`page.tsx` (and the reducer where applicable) so the prop, the wiring, and any now-orphaned
state/handlers all go together:

- `onRecipeNameChange` (recipe-name input removed from the topbar)
- `containerExampleIds`, `onAddItemExample`, `onResetItemExamples` (missed-item broadening removed)
- `fieldSamples`, `onPickerViewChange` (no longer read)

Verify each is truly unused end-to-end before deleting (some may still be set in `page.tsx`).
Keep `pickerView` — still used. Re-run typecheck/lint after.

## Notes

Pull these after the current redesign settles. When an item ships, record the rationale in an
ADR (extend ADR 0011) and update `docs/reference/builder.md` in the same commit.

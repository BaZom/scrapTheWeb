# Builder UI enhancements (post-redesign polish)

## Summary

A small batch of builder refinements requested after the Skrowt redesign (ADR 0011).
Frontend-only UX polish — no extraction/API changes expected.

## Items

### 1. Polish the preview-records table

The bottom **Preview records** table is functional but wants a visual/UX pass so it matches the
Skrowt mono look and reads cleanly:

- Column sizing / alignment (avoid overly wide or cramped columns; sensible min/max widths).
- Value truncation + tooltips for long values; keep the row height calm.
- Header styling (the field name + type chip) consistent with the monochrome theme.
- Clear empty / loading states (loading already uses `animated-data-flow-to-table.svg`).
- Image/link cells: render thumbnails / shortened links nicely rather than raw URLs.
- Keep the per-column remove (×) affordance discoverable.

Touches: the preview table block in `frontend/app/components/builder-view.tsx` and `.tbl`
styles in `globals.css`.

### 2. Remove dead code in the builder — DONE (2026-06)

Audited the originally-listed dead `BuilderProps` against current code:

- `onRecipeNameChange` — already gone (no refs anywhere). Nothing to do.
- `onPickerViewChange` — already gone. Its sibling **`pickerView`** was now also dead
  (hardcoded to `"overlays"`, nothing flipped it), so the dead **"nodes" / DOM-tree picker
  view** was removed along with the `pickerView` prop + `page.tsx` assignment (87-line deletion;
  typecheck/lint/tests green). This also closes the "unused builder DOM-tree branch" item in
  `skrowt-internal-cleanup.md`.
- `fieldSamples` — **kept (not dead).** It is woven into builder **draft persistence**
  (written into the localStorage draft and the persist effect's deps in `page.tsx`, restored in
  the reducer, exercised by `builder-reducer.test.ts`). The original "no longer read" note was
  stale. Removing it is a reducer-level change with test churn — out of scope for a dead-code
  pass; revisit only if draft persistence itself is reworked.

## Notes

Pull these after the current redesign settles. When an item ships, record the rationale in an
ADR (extend ADR 0011) and update `docs/reference/builder.md` in the same commit.

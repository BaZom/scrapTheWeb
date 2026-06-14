# Builder UI enhancements (post-redesign polish)

## Summary

Builder refinement requested after the Skrowt redesign (ADR 0011). Frontend-only UX polish —
no extraction/API changes expected.

## Open: polish the preview-records table

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

## Notes

When this ships, record the rationale in an ADR (extend ADR 0011) and update
`docs/reference/builder.md` in the same commit.

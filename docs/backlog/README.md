# Backlog — open bugs & planned work

Concrete, actionable tickets: **open bugs** and **specific planned work** not yet started.
One file per item. (Broad system limitations / production-hardening directions live in
`docs/reference/production-readiness.md`; decision history in `docs/adr/`; current behavior in
`docs/reference/`.)

## Items
- **[builder-ui-enhancements.md](builder-ui-enhancements.md)** — preview-table polish + dead-code cleanup in the builder. (Save-bounce + Run→Runs hand-off shipped via ADR 0011 FU11/FU14.)
- **[skrowt-internal-cleanup.md](skrowt-internal-cleanup.md)** — plan for deeper Sprout/API/internal naming cleanup and simplification.
- **[ux-polish.md](ux-polish.md)** — single-item page UX + icon/spacing consistency pass.
- **[object-storage-review.md](object-storage-review.md)** — check if/when we still need S3/MinIO object storage.
- **[api-connections.md](api-connections.md)** — optional "API Connection" official-data-source feature.
- **[authenticated-sources.md](authenticated-sources.md)** — strategy for login-gated sources: API connections → in-page extension → desktop agent (persistent profile, DOM extraction).

When an item ships, move its rationale into an ADR and update the matching `docs/reference/`
file, then delete or mark the backlog item done.

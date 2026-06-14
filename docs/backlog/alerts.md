# Alerts — push meaningful changes to the user

**Roadmap phase:** 0 (core loop). **Status:** open, not yet scoped in detail.

## Why

The core loop is build → monitor → **diff** → alert → export. Diff is trustworthy now
(`needs_attention` quarantine, see `architecture.md` "Run statuses & the drift fail-safe"), but
there is **no alert system**: meaningful changes only land in the stored diff / Runs view, so a
user has to come look. The Phase 0 exit gate is *"a real user acts on a meaningful alert"* — that
is unreachable until changes are pushed. This is the remaining Phase 0 gap.

## Open questions to settle before building

- **Channels:** email first? webhook? both? (B2B niche leans email + webhook.)
- **Trigger granularity:** any change, or per-field rules (e.g. "price dropped", "new item
  only")? Start simple (any new/changed/removed) and iterate.
- **Noise control:** batching/digest vs per-run; how to avoid alerting on a `needs_attention`
  run (must **not** alert — the diff was deliberately not persisted).
- **Delivery model:** who triggers (worker after a completed run?), retries, dedupe.
- **Per-tenant config + limits:** where alert settings live; tie-in with existing limits.

## Boundaries

- Alert only on **trustworthy** diffs — never on `needs_attention`/quarantined runs.
- Item-facts only, never seller PII (fixed ethics constraint, ADR 0012).

When scoped and shipped: record the why in an ADR and document current behavior in
`docs/reference/` (architecture + builder), then remove this ticket.

# Backlog — open bugs & planned work

Concrete, actionable tickets: **open bugs** and **specific planned work** not yet started.
One file per item. (Broad system limitations / production-hardening directions live in
`docs/reference/production-readiness.md`; decision history in `docs/adr/`; current behavior in
`docs/reference/`.)

> **Sequencing lives in the roadmap, not here.** `docs/reference/product-strategy.md` defines
> the strict gated phases (ADR 0013). The phase tags below mirror it; pull the **current
> phase's** items first. Do not start a deferred item without meeting its gate.

## Items (by roadmap phase)

**Phase 0 — core loop excellence on public listings (now):**
- **[extraction-robustness.md](extraction-robustness.md)** — make the saved run agree with the builder. Diagnosis verified (build engine ≠ run engine: tables break, `nth`/text diverge); fix plan proposed, awaiting go. *Highest-value Phase 0 work — the data must be right before alerts amplify it.*
- **[alerts.md](alerts.md)** — push meaningful changes to the user (email/webhook). The remaining gap before the Phase 0 exit gate ("a user acts on a meaningful alert"). *Selector-drift recovery, the precondition, is in place — see ADR 0014 + `architecture.md`.*
- **[builder-ui-enhancements.md](builder-ui-enhancements.md)** — preview-table polish in the builder.
- **[ux-polish.md](ux-polish.md)** — single-item page UX + icon/spacing consistency pass.
- **[skrowt-internal-cleanup.md](skrowt-internal-cleanup.md)** — deeper Sprout/API/internal naming cleanup and simplification.
- **[object-storage-review.md](object-storage-review.md)** — check if/when we still need S3/MinIO object storage.

**Phase 1 — source + go-to-market:**
- **[api-connections.md](api-connections.md)** — `api` source: **BYOK** API connections (customer brings their own keys); zero anti-bot/legal risk, premium B2B add-on.
- **[fortress-feasibility-spike.md](fortress-feasibility-spike.md)** — cheap parallel probe: does the per-user-browser model survive on a target fortress site? Sizes any future promise.

**Phase 2+ — deferred until the roadmap gate is met (do not start unprompted):**
- **[browser-extension.md](browser-extension.md)** — `browser` source ("Skrowt relocated"): run the sprout in the user's own browser for fortress/login sites. **Pull-gated** (ADR 0013 Phase 2).
- **[authenticated-sources.md](authenticated-sources.md)** — the source ladder (API → extension → `agent`). The `agent` (desktop, persistent profile, **watchlist-scoped, no proxies**) is **furthest out** (ADR 0013 Phase 3).

When an item ships, move its rationale into an ADR (history) and the current behavior into the
matching `docs/reference/` file (business + technical truth), then **delete** the backlog item.
The backlog holds only open work — never "done" markers or shipped stubs.

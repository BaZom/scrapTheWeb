# ADR 0013 — Product strategy: one engine, pluggable sources, public-first, niche go-to-market

- **Status:** Accepted
- **Date:** 2026-06-14
- **Scope:** Product/business direction — what Skrowt *is*, who it's for, which features are
  viable, and in what order. No code in this ADR. The current-truth, readable version lives in
  `docs/reference/product-strategy.md`; this ADR is the *why* + the rejected list.
- **Builds on / refines:** ADR 0012 (data-collection tiers). **Supersedes ADR 0012's line
  "build priority becomes the browser extension"** — see Decision. ADR 0012's collection ethics
  and rejected alternatives still stand.

## Context

Skrowt's engine (visual no-code builder → render → selector extraction → records → diff →
alerts/exports) is built and works server-side on friendly sites. The open question was
strategic, not technical: *is this a business, and if so which features, in what order?* A long
strategy review (2026-06) tested the obvious expansions and settled the following.

Findings that drove the decision:

1. **The bottleneck is proof + distribution, not capability.** The engine is already
   horizontal (it works on any site). What's unproven is that anyone comes back because a diff
   *mattered*. So the next work is validating retention, not adding reach.
2. **"General no-code monitor" is commoditised** (Visualping, Distill, changedetection.io).
   Entering there head-on offers no edge. Horizontal is where Skrowt *arrives* by winning a
   niche first — not where it launches.
3. **Skrowt's real differentiation is structured *item*-diff**, not page-diff: "3 new listings,
   1 price drop, 1 removed" — which the incumbents do poorly, and which only delivers value
   when the tool understands a domain's notion of an item. That makes niche-first a *product*
   argument, not just marketing.
4. **The defensible feature set is one engine with interchangeable ingestion sources.** Every
   viable feature is the same downstream pipeline fed differently; every rejected idea either
   breaks that engine's defensibility or isn't a feature at all.
5. **Feasibility and legality share one envelope.** A single real browser on one IP/account
   cannot survive bulk harvesting on a fortress site (behavioural detection the realness of the
   browser does *not* launder), and bulk harvesting is also where EU database-right/ToS exposure
   spikes. Watchlist-scoped, polite, facts-only monitoring is both survivable *and* defensible —
   the same lane. (See `target-site-landscape.md` ⏱️ ratings; e.g. Kleinanzeigen = 🟡 low-freq.)

## Decision

**Skrowt is one structured monitoring engine with four pluggable ingestion sources**, sold
**public-first, through one niche (camper/vehicle), with an EU/GDPR-native trust moat.**

- **The product = the engine** (build → monitor → diff → alert → export). Sources are
  interchangeable and tagged by `source_type`:
  1. `server` — server-side render+extract on friendly/public sites (**shipped**; the workhorse).
  2. `api` — **BYOK API connections**: the customer brings their own keys to data they're
     entitled to; we wire them in. Zero anti-bot/legal risk; premium B2B add-on. (`api-connections.md`)
  3. `browser` — browser extension ("Skrowt relocated") for fortress/login sites, in the user's
     own browser. (`browser-extension.md`)
  4. `agent` — private/desktop agent for unattended monitoring: persistent real profile,
     **watchlist-scoped, polite, no proxies**. (`authenticated-sources.md` Tier 3)

- **Sequencing (strict, gated):** make the **core loop excellent on public listings first**
  (incl. selector-drift recovery), prove retention with a real user, then add `api` (BYOK).
  `browser` and `agent` are **deferred until explicit pull** for fortress/unattended monitoring.
  This **supersedes ADR 0012's "build priority = browser extension"**: on-demand fortress
  collection already works manually, so the extension is no longer the next build.

- **Moats (stacked, hard to copy together):** structured item-diff · EU/GDPR-native + German
  localization · vehicle/camper domain edge.

## Rejected alternatives (do not revisit without new facts)

- **Residential proxies — anywhere, including inside the private agent.** They evidence wilful
  circumvention (legally *aggravating*, not safer), commonly rest on a non-consenting/compromised
  supply chain, and inside the agent they destroy its only defence (acting as the real user) —
  recreating exactly the alternative ADR 0012 rejected, now with **tool-maker** liability at scale.
- **API resell (raw).** Most data APIs forbid resale; raw reselling is a thin-margin,
  no-moat, supplier-dependent middleman play. The only defensible form is *licensed data exposed
  through our workflow* — a negotiated deal (e.g. an AutoUncle-type aggregator), later, not a
  build feature.
- **"General Visualping clone" as a launch strategy.** Commoditised; even the incumbents acquire
  through use-case niches. General is the destination, niche is the door.
- **Bulk harvesting** (e.g. thousands of detail-page loads/day from one agent). Not survivable
  politely on fortress sites, risks the user's account, and is the legally exposed zone. The
  deliverable promise is watchlist monitoring, sized per site by measuring the block ceiling —
  not catalogue scraping.

## Consequences

- **Next work is the core loop + retention proof, not reach.** Selector-drift recovery is
  promoted from polish to a precondition (a sprout that silently breaks turns alerts into lies).
- The four-source model is the **architecture spine**: `browser`/`agent`/`api` all reuse the
  existing records/diff/alert/export pipeline unchanged; only ingestion differs.
- Go-to-market is **B2B-leaning** (BYOK and budget live with businesses/dealers), entered through
  the camper/vehicle niche.
- The **strict roadmap + current focus** is maintained in `docs/reference/product-strategy.md`;
  backlog items are sequenced/tagged to match.

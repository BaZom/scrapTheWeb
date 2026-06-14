# Builder + run hardening across many real websites

**Roadmap phase:** 0 (core loop). **Status:** open — next focus.

## Why

The extraction engine is now unified on the browser (ADR 0015), but it's only been validated on a
handful of sites + crafted repros. Before alerts/GTM, the build → run loop needs to survive a
**broad sweep of real public listing sites** (camper/vehicle niche first, then general). Real
sites surface what unit tests can't: consent walls, lazy/infinite scroll, SPA timing, odd card
structures, pagination, mixed card variants, anti-bot pages.

## Approach

- **Pick a test set** (~15–30 real listing URLs): camper/vehicle marketplaces first
  (`target-site-landscape.md`), plus a spread of structures (table listings, card grids, SPA,
  infinite scroll, detail pages).
- For each: build a sprout, preview, save, run — and record what breaks (build-side overlay/pick,
  preview fidelity, run extraction, drift/needs_attention false positives, render timeouts).
- Fix the highest-frequency failures; capture site-class patterns, not one-off hacks.

## Likely areas to improve (from the engine work so far)

- **Build-side lazy content** — the builder render is deliberately static (no autoscroll, ADR
  0015) so a page that lazy-loads cards shows fewer items at build than the run collects. Decide
  whether/how to load lazy content for the builder *without* breaking overlay geometry (settle +
  raise the node budget, or a "load more" affordance).
- **Pagination / multi-page listings** — a sprout watches one URL; multi-page result sets aren't
  collected. Scope whether the niche needs it.
- **Render timing** — `wait_for_selector` + autoscroll help, but SPA/anti-bot timing varies; tune
  per the block-ceiling guidance in `product-strategy.md`.
- **Field robustness** — heterogeneous cards (promoted/ad variants) where a field selector misses;
  this is the by-example re-pick path — confirm it's smooth.

## Acceptance

- A documented pass/fail matrix over the test set; the common failure classes fixed or ticketed.
- No false `needs_attention` on healthy real sites; the run matches the builder preview.

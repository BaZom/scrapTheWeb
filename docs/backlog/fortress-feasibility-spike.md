# Fortress-feasibility spike — does the per-user-browser model actually survive?

**Roadmap phase:** 1 (parallel, cheap). **Status:** throwaway validation, ~1 day. **Not a build.**

## Why

The entire Tier-2/Tier-3 thesis (browser extension, then desktop agent) rests on one
unvalidated assumption from ADR 0012's own honest constraints: *even in a real, logged-in
browser, automation patterns can flag the user's account.* If that assumption fails on a target
fortress site, the extension and agent are wasted builds. This spike tests the assumption for
~5% of the cost of Phase 2 — **before** committing engineering, and decoupled from demand
timing (a niche cohort may never *ask* for fortress sites even if the thesis holds).

## What to do (manual, throwaway — no product code)

1. On a real, logged-in session for one target fortress site (Kleinanzeigen first — the proven
   wedge, rated 🟡 in `target-site-landscape.md`), run **`render_scripts/dom_candidates.js`** in
   the DevTools console on a listing/search page; confirm it captures clean `domNodes`.
2. Hand-run the extraction logic against that DOM; confirm clean item rows come out.
3. Re-load + re-extract **politely, watchlist-scoped** (item-dense list pages, jitter, a few
   hundred/day pace — *not* bulk detail loads) over a session; watch for soft-blocks,
   challenges, or account friction.

## What to record (this is the deliverable)

- Does capture + extraction work on the real logged-in page? (yes/no + notes)
- The **approximate block ceiling**: at what cadence/volume do challenges or soft-blocks begin?
  This is what sizes any honest promise per site.
- A clear verdict: **does the per-user-browser thesis survive on this site?** → feeds the
  Phase-2 gate in `product-strategy.md`.

## Boundaries

- **No proxies, no CAPTCHA bypass, no bulk harvesting** — those invalidate the test and the
  product (ADR 0013 dead options). The point is to measure the *honest* envelope.
- Item facts only; throwaway — nothing shipped, no data retained beyond the notes above.

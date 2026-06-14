# Browser extension — run the visual sprout in the user's own browser

> **Roadmap: Phase 2, the `browser` source — DEFERRED / pull-gated (ADR 0013).** Do not start
> until users explicitly ask for unattended/fortress monitoring **and** the
> `fortress-feasibility-spike.md` has proved the per-user-browser thesis survives. On-demand
> fortress collection already works manually today, so this is no longer the next build (this
> supersedes ADR 0012's "build priority = extension"). Sequencing: `product-strategy.md`.

## Summary

The browser extension is **"Skrowt relocated"** (ADR 0012): it runs the *existing* visual
sprout inside the user's own logged-in browser, so Skrowt can reach **fortress + login-gated
sites** (mobile.de, AutoScout24, Kleinanzeigen, and the Cloudflare-tier leasing/camper sites)
**without evasion** — the request originates from the user's real IP, fingerprint, and session.
Cookies never leave the machine; **only structured rows do**.

It is intentionally **thin**: it relocates the two things the server-side worker does today
(render-for-build, run-extraction) into the browser. Everything downstream — builder, diff,
records, runs, alerts, exports — is **reused unchanged**.

## The two jobs

### Job 1 — Capture the page for building (replaces the worker's render step)
1. User is on the real, logged-in page; clicks the extension → **"Build sprout from this page."**
2. Extension runs the **existing `render_scripts/dom_candidates.js`, unchanged**, in the page →
   captures `domNodes` (text/href/src/geometry) + a screenshot.
3. Posts that snapshot to the **existing builder API** — same payload shape the worker uploads
   today (feeds a `PageSession`).
4. The **current visual builder works untouched**: user clicks the repeating item + fields,
   `selector_generator.py` runs, preview renders, sprout is saved to Postgres.

So the extension is an **alternate render source** producing the identical snapshot. (That one
page of the user's own data goes to their own account — the build-time data-leaves nuance.)

### Job 2 — Run the saved sprout (replaces the worker's extraction step)
1. Trigger: **"Collect now,"** or a scheduled `chrome.alarms` fire (while the browser is open).
2. Background worker opens the sprout's target URL in a **background tab** (user's live session).
3. Content script runs the **sprout's saved selectors** against the live DOM — the same
   extraction `recipe_runner.py` does, ported to a JS content script.
4. Sends **only structured rows** (item facts — **never seller PII**) to the server.
5. The **existing diff engine** computes new/changed/removed → records → fires alert/export.

## Reuse map (existing → extension)
| Existing (server) | Extension home |
|---|---|
| `render_scripts/dom_candidates.js` | content script (build), **verbatim** |
| `selector_generator.py` / builder UI | **unchanged** — fed by the posted snapshot |
| `recipe_runner.py` extraction logic | ported to content script (run) |
| diff / records / runs / exports / alerts | **unchanged**, server-side |
| `PageSession` + records ingestion shapes | reused by two new endpoints (below) |

## Components (small surface)
1. **Content script** — runs `dom_candidates.js` (build) and selector extraction (run).
2. **Background service worker** — holds the user's sprouts, fires `chrome.alarms`, opens/closes
   background tabs, posts to Skrowt.
3. **Popup** — minimal: "Build sprout from this page," "Collect now," sprout list + last-collected
   status, link to the dashboard.
4. **Two API endpoints** — `POST snapshot` (build) and `POST rows` (run), reusing existing
   `PageSession`/records shapes. Add a **`source_type: "browser"`** sprout marker.

## Hard boundaries (keep it thin and safe)
- ❌ Never read, store, or transmit cookies or passwords.
- ❌ No diff/storage/scheduling logic of its own (server-side only).
- ❌ No separate builder UI (feeds the web builder).
- ❌ No evasion — real session, human pace, one tab at a time, jitter.
- **Per-site host permissions** (only domains the user adds) to keep the install warning small.
- **Skrowt login is separate** from platform logins (which stay in the user's normal session).

## Honest constraints
- **Scheduling = browser-open only** (MV3 service-worker lifetime + background-tab throttling).
  Show "last collected Xh ago," tolerate missed runs. True 24/7 = the later **desktop agent**
  (`authenticated-sources.md` Tier 3).
- **Store-policy risk:** Chrome Web Store scrutinizes automation/scraping extensions — risk of
  rejection/removal; disclose behavior clearly. Desktop-only (no mobile).
- **Permission scare** lowers install conversion → request host access per-site, on demand.
- **Detection/ToS not eliminated:** even in a real browser, automation patterns can flag the
  user's account → ToS disclosure required (ADR 0012).

## Suggested phases
1. **Job 1 + manual Job 2** ("Build here" + "Collect now" → rows to cloud, manual trigger).
   Proves the whole loop on one fortress site (mobile.de or Kleinanzeigen).
2. Soft scheduling (refresh-while-open), session-expiry detect → pause + reconnect, ToS
   disclosure flow, per-site permissions.
3. (Separate item) desktop agent for unattended scheduling — persistent profile, not cookie
   transplant.

## Acceptance
- A sprout built **and** run end-to-end on a logged-in fortress page, with rows landing in the
  existing records/diff flow and an alert firing — cookies never leaving the machine.
- Builder/diff/records/exports code paths unchanged (only new ingestion endpoints + `source_type`).

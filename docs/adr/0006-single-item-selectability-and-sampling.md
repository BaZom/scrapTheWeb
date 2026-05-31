# ADR 0006 — Single-item selectability, faithful field sampling, render reliability

- **Status:** Accepted / implemented
- **Date:** 2026-05-31
- **Scope:** `backend/app/worker.py`, `backend/app/render_scripts/dom_candidates.js`,
  `backend/app/overlay_reduction.py`, `frontend/app/page.tsx`,
  `frontend/app/components/builder-view.tsx`
- **Refines:** ADR 0001 (overlay cap), 0003 (truncation), 0005 (single flow).

A batch of fixes found by testing real pages (autoscout24, kleinanzeigen). Each is
generic — no per-site logic.

## 1. Single-item pages keep the whole item, not incidental repeats

**Problem.** A one-item detail page (e.g. one car) has 1740 visible elements but
incidental repeats — spec `<li>` lists, galleries, financing widgets — that the
candidate detector picks up as ~78 low-scoring candidates. The candidate-aware
truncation (ADR 0003) then spent the 500-node budget on those subtrees and **dropped the
item's main content**: the headline price `€ 31.280` was at document index 456 but not in
`domNodes`, so it had no overlay and couldn't be selected.

**Fix.** Truncation is now shape-aware, mirroring the frontend's list/single decision:
- **Strong candidate present (score ≥ 40 → list):** prioritize the listing subtree
  (cards can be deep). Unchanged.
- **No strong candidate (single/unstructured page):** keep **plain document order**, so
  the item's main fields (title, price near the top) are never crowded out.

Also raised `MAX_DOM_NODES` 500 → 900 for headroom so "anything related to the item"
(main fields *and* details) is captured. Overlays are hover-only, so more nodes add no
visual clutter. Verified: the headline price is now in `domNodes` on the detail page.

## 2. Small/main details are selectable in field mode

**Problem.** The overlay set sliced to the **220 largest** boxes, so small elements
(price, mileage) — exactly what you map — had no overlay to click.

**Fix.** In **field mode** the overlay set is no longer capped: every element is
selectable. Boxes still sort largest-first so small ones paint on top and win the hover
hit-test. (Container mode keeps the 220 cap, where you want the larger blocks.) Min
element size relaxed 8px → 6px. (Supersedes the 220-cap behavior noted in ADR 0001.)

## 3. The live "Sample" shows the element you clicked

**Problem.** The live field Sample read `rows[0]` of a preview — the *first* card's
value — regardless of which element you clicked, so it showed "a previous listing's"
value. The selector was correct; the feedback lied.

**Fix.** The Sample now reads the value **straight from the clicked node** (`fieldNode`):
text → node text, href/src → that attribute, custom attribute → that attr. Instant, no
round-trip, always matches what was selected. To support href/src samples, `href` and
`src` are now captured in `dom_candidates.js` node attributes (previously only
id/class/role/itemprop/data-*). The bottom "Preview records" table (server-side, all
rows) was already correct and is unchanged.

## 4. Consent overlay handler no longer crashes

**Problem.** Playwright ≥1.42 invokes an `add_locator_handler` callback **with the
triggering Locator as the first positional arg**. `overlay_reduction.py`'s handler used
that slot for its `pattern` closure default, so `pattern` became a Locator →
`'Locator' object has no attribute 'replace'` on every trigger; the auto-dismiss
handlers never fired.

**Fix.** The handler now absorbs the locator in a leading `_triggered` parameter, leaving
`pattern`/`name` intact. (Pairs with the accept-all last-resort fallback for CMPs that
offer no reject button.)

## 5. Render waits for DOM, not network idle

**Problem.** `page.goto(wait_until="networkidle")` never settles on ad/tracking-heavy
SPAs (autoscout24), so the render timed out and the whole job failed — nothing reached
the bucket.

**Fix.** Navigate with `wait_until="domcontentloaded"` plus a **bounded** best-effort
`networkidle` settle (1s — see §6) that proceeds regardless. Candidate extraction is also
wrapped so a JS hiccup can't discard an already-captured screenshot.

## 6. Render performance (the waits were the cost)

**Problem.** A measured render of the autoscout search page took **~9.4s**, almost all of
it in two idle waits: the `networkidle` settle burned the full **3s** (the page never goes
idle), and `overlay_reduction` spent **~4.5s** looping 3× with 400–500ms waits, 1200ms
click timeouts, and `Escape` re-triggering the loop on lingering modals.

**Fix (behaviour preserved, just stop idling):**
- `networkidle` settle 3s → **1s** (the DOM is already present after `domcontentloaded`).
- `overlay_reduction`: initial wait 400→250ms, loop 3→2 passes, per-pass waits 500/400→
  250ms, click timeout 1200→800ms, and a single `Escape` that no longer keeps the loop
  alive once the banner is gone.

**Result:** ~9.4s → **~3.7s** on the same page, with consent still dismissed. Remaining
time is real work (navigation, screenshot, DOM extraction). Reusing one browser across
renders (instead of launching per render) is a further win, left for later.

## Concepts to look up
- **Budgeted DOM serialization** — why *which* nodes you keep matters more than how many,
  and why the right baseline differs for list vs single pages.
- **Faithful feedback** — UI feedback must reflect the user's actual action (the clicked
  element), not a convenient proxy (`rows[0]`).
- **Playwright locator handlers** — the callback receives the triggering Locator; handler
  signatures must account for it.
- **`load` / `domcontentloaded` / `networkidle`** — which readiness signal fits the
  modern, never-idle web.

## Verification
- Backend `py_compile` (worker); frontend `typecheck` + `lint` clean.
- Probes (in gitignored `scratch/`) confirmed: headline price now in `domNodes` on the
  single page; per-card extraction distinct and correct on the list page; overlay handler
  runs without the Locator error and still dismisses.
- `ruff`/`pytest` unavailable in this environment.

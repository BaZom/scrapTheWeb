# Selector-drift recovery — keep monitoring trustworthy when a page changes

**Roadmap phase:** 0 (core loop). **Status:** precondition, not polish (ADR 0013).

## Why this is a precondition, not a nice-to-have

Skrowt's value is the *meaningful diff*. A saved sprout whose selectors silently stop matching
(the site re-skinned, a class changed, a layout shifted) produces an empty or wrong result set —
which the diff engine reads as **"everything was removed."** A monitoring tool that lies is
worse than no tool, so trustworthy output depends on detecting and recovering from drift.

**Note (verified 2026-06):** there is **no alert system yet** — change events are stored and
queried via the API, nothing is pushed. So today the lie lands in the **stored diff / Runs
view**, not in a notification. That's the reason to fix this *now*: add the fail-safe before
alerts are ever built on top of the diff, so alerts are born trustworthy.

## Current behavior (verified against code, 2026-06)

The zero-match path is silent and ungaurded end-to-end:

1. **Empty result, no error.** A container selector matching nothing returns `[]` — no
   exception. (`backend/app/recipe_runner.py:62-92`, esp. `:72` containers, `:85-90` fields)
2. **Marked "completed", not failed.** The worker sets `status="completed",
   total_records=len(rows)` whether that's 100 or 0. (`backend/app/worker.py:256-262`; run
   executed in `run_recipe` `:222-280`)
3. **Diff is pure set math → mass "removed".** `detect_changes` emits one `removed` event for
   every key in `previous - current`; previous-N vs current-0 ⇒ **N removed events**, no guard.
   (`backend/app/change_detector.py:13-52`; persisted by `persist_change_events_for_run`
   `:55-96`, called at `worker.py:255`)
4. **No guards anywhere.** No threshold, no min-count, no "skip diff if empty", no baseline
   comparison, no completed-with-0 vs completed-with-data distinction. (confirmed by search)

## Two hooks the code already provides (keep the fix small)

- **Baseline already computed, just not persisted.** Build-time match count exists as
  `matchCount` (`backend/app/selector_generator.py:58`) and is shown to the UI, but is never
  saved. `RecipeVersion.validation_report` (JSONB) exists and is **always `None`**
  (`backend/app/models.py:166-189`; set null at `backend/app/recipes.py:364`). → Persist the
  build-time count (and per-field non-empty rates) into `validation_report` — **no schema
  migration needed** — giving run time a baseline to compare against.
- **One natural choke point for the guard:** around `persist_change_events_for_run`
  (`change_detector.py:55-96` / `worker.py:255`). Decide drift-vs-real *before* persisting the
  diff.

## What it must do

1. **Detect drift on a run** — distinguish "genuinely 0/fewer items now" from "selectors broke."
   Signals: current count collapses to 0 (or far below the persisted baseline) **while the page
   still rendered and has content**; required fields go uniformly empty; container no longer
   found. (Render success vs. extraction failure is the key disambiguator — the page loaded but
   the selectors matched nothing.)
2. **Fail safe, don't fail silent** — on suspected drift, **do not persist a "removed
   everything" diff.** Quarantine the run and mark the sprout **"needs attention"** (new run
   status, or `status="completed"` + a flag / `error_message` — decided at `worker.py:256-262`).
3. **Recover by example (no code)** — per the standing guardrail, the user re-opens the page and
   re-picks the item/fields; `selector_generator` regenerates. No selector strings shown or typed.
4. **Honest status** — surface "last successful run", "drift detected", "paused — re-pick needed"
   in the UI; resume cleanly after re-pick (and refresh the baseline on re-pick).

## Scope / boundaries

- Reuse the existing render → `selector_generator` / `recipe_runner` path; this is detection +
  a guard + UX, **not** a new extraction engine.
- **No teach-by-example broadening** and **no heuristic auto-repair** (both removed/rejected —
  CLAUDE.md guardrails). Recovery = the user re-picks; the tool infers from the new example.
- Vision-based repair is explicitly out of scope here (only ever a later `agent` fallback,
  `authenticated-sources.md`).
- Pick a **defensible drift threshold** (e.g. count drops to 0, or below X% of baseline, while
  render succeeded) — start simple; a genuine large real-world removal is rare enough that
  quarantining + asking the user to confirm is the safe default.

## Acceptance

- A sprout whose page structure changed is **detected as drift, quarantined (no mass-removal
  diff persisted), and the sprout marked "needs attention"** — run history shows the pause, not
  a false "all removed". A by-example re-pick restores it and refreshes the baseline.
- A genuine "the page really does have fewer/zero items" case is still handled correctly (not
  every shrink is drift — the render-succeeded + below-baseline combination is what flags it).
- Record the rationale in an ADR and update `docs/reference/builder.md` + `architecture.md`
  (diff/run-status sections) when it ships.

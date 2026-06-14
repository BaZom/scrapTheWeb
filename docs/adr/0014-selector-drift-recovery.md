# ADR 0014 — Selector-drift recovery: quarantine untrustworthy runs before they diff

- **Status:** Accepted
- **Date:** 2026-06-14
- **Scope:** The monitoring run path — how a run that extracted nothing trustworthy is detected
  and handled so the diff never lies. Backend (`run_health.py`, `worker.run_recipe`) +
  the Runs UI status surfacing. Current-truth lives in `architecture.md` (run statuses) and
  `builder.md` (recovery UX); this ADR is the *why* + rejected alternatives.
- **Implements:** the Phase-0 precondition in `product-strategy.md` (core-loop trustworthiness).

## Context

Skrowt's value is the **meaningful item-diff**. The diff (`change_detector.detect_changes`) is
pure set math: for keys in `previous − current` it emits one `removed` event each. A saved
sprout whose selectors silently stop matching (the site re-skinned, a class changed, a layout
shifted) extracts **zero rows** with no error — `recipe_runner.extract_preview_rows` returns
`[]`. The run was then marked `completed`, and the diff read previous-N vs current-0 as **"all N
removed"** and persisted it. An anti-bot block produced the identical failure: the render
already computed an access-block signal (`_detect_access_block`) but the run path **discarded
it**, so a blocked run also looked like a mass removal.

There is **no alert system yet**, so today the lie lands in the stored diff / Runs view rather
than a notification — which is exactly why this is fixed *now*: the fail-safe must exist before
alerts are ever built on top of the diff, so alerts are born trustworthy. A monitoring tool that
lies is worse than no tool.

## Decision

Health-check every run **before persisting its diff**. In `run_recipe`, after records are
persisted and before `persist_change_events_for_run`, call the pure
`assess_run_health(...) → "ok" | "drift" | "empty" | "blocked"`:

- **baseline** = the previous **`completed`** run's `total_records` — the same run the diff
  compares against.
- **`blocked`** when the render's anti-bot signal fired (now consumed on the run path, not
  discarded).
- **`drift` / `empty`** when a baseline existed (> 0) and extraction collapsed to ≤
  `DRIFT_FLOOR_RATIO` of it (starts at `0.0` ⇒ only a total collapse to zero trips it; a single
  knob to loosen later). The collapse is what matters — **whether or not the page rendered
  content, the result is untrustworthy and must not be diffed.** `page_had_content` only
  splits the reason: content present but items vanished ⇒ `drift` (selectors broke, re-pick);
  blank/near-empty shell ⇒ `empty` (the fetch delivered nothing — often transient).
- **`ok`** otherwise — first run (no baseline), or a genuine partial shrink that still
  extracted items.

On `drift`/`empty`/`blocked` the run is marked **`needs_attention`** (a new free-form value of
the existing `String(32)` status — no migration), its records are **kept** (the run stays
inspectable), and **no change events are written**. Because baseline selection only considers
`completed` runs, a quarantined run **cannot poison the next comparison**. `needs_attention` is
also a **terminal** run state (SSE stream + client polling stop on it, alongside
`completed`/`failed`). The Runs UI surfaces it as a distinct "Needs attention" group/badge with
an honest, code-free reason.

**Recovery is by example** (the standing builder guardrail): the user re-opens the page and
re-picks the items; the next successful run re-establishes the baseline. No selector strings, no
auto-repair.

## Rejected alternatives

- **Persist build-time `matchCount` into `RecipeVersion.validation_report` as the baseline**
  (the original ticket's hook). Rejected: the save payload (`RecipeCreateRequest`) doesn't even
  carry `matchCount`, so this needs save-API + frontend changes, and it compares a *snapshot*
  count to a *live* count. The previous completed run's `total_records` is already loaded for the
  diff, needs no new plumbing, and compares like-to-like (run vs run). `validation_report`
  stays unused/None.
- **Heuristic auto-repair / teach-by-example broadening of a broken selector.** Rejected
  (removed/forbidden by CLAUDE.md guardrails, ADR 0009). Recovery = the user re-picks.
- **Vision-based repair.** Out of scope here — only ever a later `agent`-tier fallback
  (`authenticated-sources.md`).
- **Guarding inside `detect_changes` (suppress mass-removal there).** Rejected: the diff
  function is pure and correct; the right place to decide "is this result trustworthy" is the
  run path that has the render/block/baseline context, not set math.
- **Failing the run (`status="failed"`).** Rejected: drift isn't an execution failure (the
  worker succeeded); conflating them loses the "re-pick to fix" signal and the kept records.

## Consequences

- A drifted/blocked sprout is detected, quarantined (no false mass-removal), and flagged for a
  by-example re-pick — run history shows the pause, not a lie.
- A genuine partial shrink (e.g. 20 → 18) stays a normal `completed` diff. A *total* collapse to
  zero against a populated baseline always quarantines (never diffed), even on a blank page —
  the threshold is deliberately strict, with quarantine-and-ask as the safe default. A genuine
  "the page really is empty now" is rare and worth a human glance.
- New observability: `worker_job_total{outcome="needs_attention"}` and a
  `worker_job_needs_attention` log line.
- `DRIFT_FLOOR_RATIO` is the single tuning knob if real-world drift commonly leaves a few stray
  matches.

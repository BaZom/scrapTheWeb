# Selector-drift recovery — keep monitoring trustworthy when a page changes

**Roadmap phase:** 0 (core loop). **Status:** precondition, not polish (ADR 0013).

## Why this is a precondition, not a nice-to-have

Skrowt's value is the *meaningful diff*. A saved sprout whose selectors silently stop matching
(the site re-skinned, a class changed, a layout shifted) produces an empty or wrong result set —
which the diff engine reads as **"everything was removed"** or **"nothing changed."** That turns
alerts into lies, and a monitoring tool that lies is worse than no tool. So trustworthy alerts
(Phase 0's whole point) depend on detecting and recovering from drift.

## What it must do

1. **Detect drift on a run** — distinguish "genuinely 0 items now" from "selectors broke." Signals:
   match count collapses to 0 (or far below the rolling baseline) when the page still renders and
   has content; required fields go uniformly empty; container no longer found.
2. **Fail safe, don't fail silent** — when drift is suspected, **do not emit a "removed
   everything" diff/alert.** Pause the sprout, mark it "needs attention," and notify the user.
3. **Recover by example (no code)** — per the standing guardrail, the user re-opens the page and
   re-picks the item/fields; `selector_generator` regenerates. No selector strings shown or typed.
4. **Honest status** — surface "last successful run", "drift detected", "paused — re-pick needed"
   in the UI; resume cleanly after re-pick.

## Scope / boundaries

- Reuse the existing render → snapshot → `selector_generator` / `recipe_runner` path; this is
  detection + UX around it, not a new extraction engine.
- **No teach-by-example broadening** and **no heuristic auto-repair** (both removed/rejected —
  CLAUDE.md guardrails). Recovery = the user re-picks; the tool infers from the new example.
- Vision-based repair is explicitly out of scope here (only ever a later `agent` fallback,
  `authenticated-sources.md`).

## Acceptance

- A sprout whose page structure changed is **detected as drift, not reported as "all removed,"**
  the user is notified, and a by-example re-pick restores it — with run history showing the
  pause rather than a false mass-removal alert.
- Record the rationale in an ADR and update `docs/reference/builder.md` when it ships.

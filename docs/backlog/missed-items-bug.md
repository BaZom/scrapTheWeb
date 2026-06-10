# Bug — "Add missed items" still misbehaves

**Status:** open · **Area:** builder / list mode / item teach-by-example

## Symptom
When the auto-pick misses some cards and the user tries to add them ("Add missed items" →
click the missed cards), it still doesn't behave correctly. (Reported in manual testing;
exact repro not yet captured.)

## History (what was already tried)
Earlier fixes shipped under ADR 0009:
- Frozen detected items so only genuinely-missed regions are clickable (commit "freeze
  detected items when adding missed ones").
- The Item-card nudge switches to Item mode so clicks land in container mode.
These reduced the problem but did not fully resolve it.

## Where to look
- Container-mode click routing: `handleContainerPick` in
  `frontend/app/components/builder-view.tsx` (first click = pick; later clicks inside a
  detected item are ignored; outside = add example).
- The frozen vs clickable split and the `matchedContainerIdOf` guard.
- Re-inference on each added example: `onAddItemExample` → `inferSelector` →
  `container_selector_inferred` (page.tsx + reducer); backend `infer_selector` in
  `selector_generator.py`.

## First step
Capture a concrete repro: the page, what's clicked, and what wrongly happens (nothing added /
wrong item added / count doesn't grow / etc.). Then fix and add a regression test.

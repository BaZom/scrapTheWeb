# Sprout save semantics — duplicates & versioning (needs a decision)

**Roadmap phase:** 0 (core loop). **Status:** open — **discuss before building.**

## Current behavior (verified 2026-06)

- `Recipe` has **no uniqueness constraint** (`models.py` — only websites `(org, domain)` and
  `recipe_versions (recipe_id, version)` are unique). `create_recipe` (`recipes.py`) does **no
  duplicate check** — every save creates a **new** `Recipe` at `version=1`.
- So saving the same sprout (same name / URL / selectors) twice yields **two separate sprouts**.
- The `RecipeVersion` table exists and is versioned per `recipe_id`, but **re-saves never use it**
  — there's no "update this sprout → bump to version 2" path. The versioning infra is effectively
  unused.

## The questions to settle

1. **What is a re-save?** A new sprout, a new *version* of the same sprout, or an idempotent
   no-op? (The versioning table implies "new version" was the intended model.)
2. **What makes two sprouts "the same"?** (org + URL? + name? + selector set?) Drives whether we
   add a uniqueness constraint or a soft "you already have a sprout for this page" warning.
3. **Edit flow.** Today editing = re-pick + save = a brand-new sprout, orphaning the old one and
   its run history. Should editing update the existing sprout (new `RecipeVersion`) and keep its
   runs/diff baseline? (Note: drift recovery's baseline is the previous *completed run* of the
   **same** recipe_id — a re-save to a new recipe_id silently resets that baseline.)
4. **UX.** Warn on duplicate save? Offer "update existing" vs "save as new"?

## Why it matters

Duplicate sprouts mean duplicate scheduled runs (load + politeness budget, ADR 0013), split run
history, and a confusing list. And re-save-as-new-recipe **resets the drift baseline** (ADR 0014),
so a tweak to a working sprout starts its trustworthiness checks from scratch.

## Likely direction (to confirm)

Make save **update an existing sprout** (new `RecipeVersion`, same `recipe_id`, runs/baseline
preserved) when it matches an existing one; only create new when the user explicitly chooses
"save as new." Add a uniqueness signal (constraint or warning) on the agreed identity. Decide,
then ADR + migration if a constraint lands.

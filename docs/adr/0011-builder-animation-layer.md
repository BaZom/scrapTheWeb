# ADR 0011 — Builder animation layer (Harvestly motion direction)

- **Status:** Accepted
- **Date:** 2026-06-10
- **Scope:** `frontend/app/components/animations/*` (new), `frontend/app/components/builder-view.tsx`
  (integration only), `frontend/app/globals.css` (one keyframe), `frontend/package.json`
  (+`motion`). Frontend-only. No backend, API, reducer, or extraction changes.
- **Builds on:** ADR 0005 (shape detection), ADR 0009 (teach-by-example, no-code builder),
  ADR 0010 (single-flow + select-all polish).

## Context

The product direction is moving toward a brand/visual identity ("Harvestly") whose mood is a
*minimal living harvest workspace*: calm, monochrome-friendly, precise, slightly playful,
where "you click one result, the app finds the pattern, and the page turns into a clean
preview table." The existing builder is fully functional but motion-less, so those meaningful
moments (pattern found, data collected, preview ready, saved) pass without feedback.

This task adds **only an animation/interaction layer** — explicitly **not** a layout redesign
and **not** a rename (the app stays `ScrapTheWeb` internally).

## Decision

Add `motion` (Framer Motion's successor package, `motion/react`) and a small set of reusable,
**client-only** animation components under `frontend/app/components/animations/`, then wire
them to existing product state at meaningful moments. Animation state is **visual-only** and
lives in the view (local `useState` + `useEffect`), never in the reducer — product state and
animation state stay separate.

**Components (each respects `useReducedMotion`):**

| Component | Moment | Trigger (existing builder state) |
|---|---|---|
| `AnimatedResultOutline` | selected result pulse; matched set fade/reveal | container-mode `selectedNode` + `matchedNodeIds` |
| `PatternFoundCard` | "N similar results" reward card (auto-dismiss ~3.6s) | `selectorResult.matchCount > 1`, list shape |
| `AnimatedFieldRow` | "Data to collect" rows animate in/out/reorder | wraps each `allCandidates` row under `<AnimatePresence>` |
| `AnimatedPreviewDrawer` | bottom preview table slides up | `previewRows.length > 0` |
| `AnimatedPreviewRow` | table rows fade/rise in, lightly staggered | each preview `<tr>` |
| `SeedBurst` | one-shot seed scatter on preview success | `useEffect` on `props.preview` |
| `SproutIcon` | "records ready" + "Saved" success motif | `previewRows.length > 0`; `savedRecipe` |

Plus: status chips (`matches`, `Popup dismissed`) fade/settle in as the page is understood,
and a **display-only** friendly fallback (`isUglyGeneratedName` → "Rename this field"
placeholder) for auto-generated names like `field_1` / `text_title3` — it never changes the
internal key or the committed field name.

**To avoid drawing outlines twice:** in container mode the interactive overlay buttons stop
painting the selected/matched borders (the animated layer owns them); the buttons keep hover
feedback and all click behaviour. Field mode is unchanged.

## Rejected alternatives / deferred

- **`HarvestStepper`** (dotted seed path on the existing stepper): deferred — the spec said
  skip if it risks the layout, and the current `Stepper` is shared (`ui.tsx`) and load-bearing.
  Easy to adopt later.
- **GSAP / Lottie:** out of scope by request; `motion` only.
- **Putting animation flags in the reducer:** rejected — no cross-slice invariant; keeping it
  in the view means the animation layer is trivially tunable/removable.
- **Fixed-position drawer** (as in the original `AnimatedPreviewDrawer` sketch): adapted to an
  in-flow slide-up so it drops into the existing bottom panel without repositioning anything.

## Cost / notes

- Bundle: builder route First Load JS ~137 kB → ~180 kB (motion). Acceptable for the value.
- `SeedBurst` also fires if a restored draft already has a preview (mount-time) — a brief,
  harmless 1.3s cue.
- **Tuning/removal:** see `docs/reference/builder.md` §9. Durations/springs live in each
  component; deleting the `animations/` imports + wrappers reverts to the static builder.

## Concepts to look up

- `motion/react` (`motion`, `AnimatePresence`, `useReducedMotion`, layout animations).
- `prefers-reduced-motion` accessibility; SVG `pathLength` line-drawing.

## Status

Automated checks green (typecheck / Vitest / `next lint` / `next build`); motion verified
present in the rebuilt frontend Docker image. Live-stack manual eyeball still recommended
(motion timing + the freeze/overlay interplay want a real look).

---

## Follow-up (2026-06-10) — Full Harvestly mood shift

**Why this section exists:** the original decision above scoped the work to a motion layer
*only* ("explicitly not a layout redesign and not a rename"). On reviewing it live, the user
found it underwhelming — the motion sat on top of the unchanged ScrapTheWeb visual system, so
the app didn't *feel* like the Harvestly inspiration. Re-reading the original brief confirmed
it asked for both an animation layer **and** "moving the existing builder UI toward the
Harvestly design direction." That second half had been dropped. The user explicitly chose a
**full mood shift**. This section records that expanded decision (append-only; the original
reasoning above is left intact as history).

### Decision (expanded)

Re-skin the app to the Harvestly *mood* — monochrome ink-on-paper, monospace, quiet — on top
of the existing token system, without a risky structural rewrite:

- **Palette → monochrome (`globals.css :root`).** Teal accent → near-black ink; surfaces →
  paper white; borders → thin warm-grey (~black/10–18%); `--info` desaturated to neutral ink.
  One chromatic note kept: a muted **`--sprout`** green (+ `--soil` brown) reserved for
  harvest/seed motifs and success. Hardcoded builder selection overlays (purple/teal/blue
  rgba) and the avatar palette recoloured to ink.
- **Type → Inconsolata** (`layout.tsx` font link + `--font-sans`/`--font-mono`). The whole UI
  is now monospace for the "structured-data workspace" feel; Geist Mono is the fallback.
- **HarvestStepper** (the deferred item) — built after all: `LOAD → PICK → CHOOSE → PREVIEW →
  SAVE` seeds strung along a dotted seed path, replacing the generic compact `Stepper` in the
  builder header. Derived from the same `currentStep` state; labels are the first word of the
  existing step labels, uppercased.
- **`SproutInSoil`** motif (new component) — sprout drawing itself from a soil mound; used as
  the preview-ready cue. **Bolder `SeedBurst`** — soil-coloured, more particles, a downward
  scatter (was a faint grey localized puff). Stronger selected-outline pulse + preview-row
  entrance.
- **Friendly copy + brand label.** Sidebar brand mark → a sprout, "ScrapTheWeb" → **Harvestly**
  (sidebar label + page `<title>` only — *no* global/internal rename, per the brief). "N
  matches" → "N similar results found"; "Found N similar items" → "Great! We found N similar
  results"; "Popup dismissed" → "Popups dismissed"; preview cue → "Looking good! N records
  ready — save your recipe or run a test."

### Not done / preserved

- **No structural/layout rewrite, no backend/API/reducer/extraction change.** The retheme is
  tokens + font + copy + a few visual components.
- Third-party brand colours left intact on purpose: Google OAuth logo, per-site favicon
  palette (`FaviconTile`), macOS window-chrome traffic-light dots.
- `warning`/`danger` status colours kept semantic (errors must stay legible).

### Cost / verification

- Reverting the mood shift = restore the `:root` palette + font tokens and the copy strings;
  the components (`HarvestStepper`, `HarvestArt`) can be deleted independently.
- Automated checks green (typecheck / 32 Vitest / `next lint` / `next build`); rebuilt the
  frontend Docker image and confirmed it serves Inconsolata + the Harvestly brand.

## Follow-up 2 (2026-06-10) — reference-ratio pass + provided asset kit

Verified the result against the design reference *visually* (host `next dev` on :3001 + a
throwaway `/harvest-preview` route rendering the real `BuilderView` with mock props, screenshot
via Playwright) rather than shipping blind — the earlier misses were all undersized/oversubtle
elements that an eyeball catches immediately. Changes:

- **Stepper matched to the reference ratios:** numbered `1–5` (not `01`), straight thin
  connectors with the completed segment darkened, only the current step filled ink, labels
  beneath, larger circles + a sprout illustration set beside it.
- **Adopted the design team's asset kit** (`frontend/public/harvest-assets/`) via a new
  `HarvestArt` `<img>` wrapper, replacing the hand-drawn `SproutIcon`/`SproutInSoil` (both
  deleted). Animated SVGs self-animate + handle reduced-motion; `currentColor` → ink.
- **Removed the noisy field-name summary** ("Collecting field, link, field_2, … from N items") —
  it dumped raw generated keys; the `N fields` heading already covers the count.
- Illustrated empty preview state ("Your harvest will grow here") + sprout motifs on the stepper
  terminus, Details heading, TIP card, and Saved badge.

## Follow-up 3 (2026-06-10) — builder-first shell + closer reference composition

The provided reference image showed a full Harvestly workbench, not the generic product shell
with a themed builder embedded inside it. The previous pass still kept the dashboard header,
workspace switcher, and old auth branding, so the screen did not match the intended composition.

Decision:

- **Builder gets the workbench shell.** `AppShell` hides the generic top header for the builder
  view. The left rail now starts with the sprout mark, **Harvestly**, and the tagline
  "turn websites into structured data"; `Builder` is the first nav item and `Dashboard` is
  labelled `Overview` in the visible nav.
- **Builder topbar matches the reference hierarchy.** The stepper is centered, the sprout art is
  beside it, and the right-side actions are `Preview table` and `Save recipe`. The URL, reload,
  page-loaded, similar-results, popup-dismissed, and mode controls live in one rounded command
  bar below.
- **Provided assets are used for specific moments.** `selected-card-seed-burst.svg` powers the
  pattern-found side card; `field-chip-link.svg`, `field-chip-image.svg`, and
  `field-chip-text.svg` mark suggested data rows; `table-harvest-ready.svg` and
  `empty-state-sprout-card.svg` are used in preview states.
- **No-code principle tightened.** The visible `Advanced` DOM-tree button was removed from the
  default builder toolbar; the default surface remains click/tick/toggle.
- **Auth visible branding aligned.** The unauthenticated screen now uses the sprout mark and
  Harvestly copy so the product no longer opens with conflicting names.

Preserved: no backend/API/reducer changes; extraction behavior is untouched.

## Follow-up 4 (2026-06-10) — motionful loading + clearer workbench zones

The previous workbench pass looked closer to the reference composition, but the user called out
that it still felt static. The asset kit already included loading/table-flow/step-complete SVGs,
so the right fix was to use those assets at the moments where the product is waiting.

Decision:

- **Screenshot loading is animated.** Initial page capture and in-place reloads now show
  `animated-collecting-data.svg` in a loading card/overlay rather than a text-only pending
  state.
- **Preview loading is animated.** While the bottom preview table is being generated, it shows
  `animated-data-flow-to-table.svg`; when rows arrive, the existing preview drawer/row stagger
  still handles the reveal.
- **Stepper motion is more visible.** The stepper now uses `animated-step-complete-seed.svg`
  inside completed steps and a travelling `animated-seed-trail.svg` on the latest connector,
  while still respecting reduced-motion.
- **Run stays visible.** `Run` is always in the top action bar, but remains disabled until a
  recipe has been saved.
- **Section surfaces are differentiated.** Sidebar, builder header/command/footer, canvas, and
  inspector now use related but distinct warm paper surfaces so the user can visually separate
  navigation, controls, screenshot work area, data collection, and preview results.

Preserved: no backend/API/reducer changes; all additions remain visual-only.

## Follow-up 5 (2026-06-10) — uploaded Harvestly wordmark as primary logo

The user provided a new Harvestly wordmark image and asked for it to become the main logo. The
source image had a large white canvas, so it was added as the original source asset and also
prepared as a cropped transparent PNG for real UI placement.

Decision:

- **New assets:** `pics/harvestly-logo-source.png` keeps the original uploaded image;
  `pics/harvestly-wordmark.png` is the cropped transparent wordmark used in the app.
- **Primary logo placement:** sidebar brand and unauthenticated/auth brand now use the wordmark
  instead of the separate sprout mark + text composition.
- **Small sprout motif preserved:** `pics/sprout-logo.svg` remains mapped as `logo` for compact
  status/detail moments such as field sections and saved badges, where the full wordmark is too
  wide.

Preserved: no backend/API/reducer changes.

## Follow-up 6 (2026-06-10) — quieter topbar status + single preview action

The reference-inspired top command bar had become too noisy: it repeated information that was
already available elsewhere and offered two entry points for the same preview operation.

Decision:

- Removed the top command-bar chips for "N similar results found" and "Popups dismissed".
  Page loaded/loading remains because it describes the current capture state.
- Removed the top **Preview table** button. Preview remains the explicit bottom/right-panel
  **Preview records** action, which is where the user is already selecting fields.
- Removed the animated `PatternFoundCard` side card as part of the same noise reduction.

Preserved: loading/preview animations, stepper motion, matched-node outlines, and the bottom
preview table reveal.

## Follow-up 7 (2026-06-10) — builder config only, live runs reviewed elsewhere

After the workbench polish, the user pointed out that the run/test moment was still too small:
the builder showed a bottom notification while real data fetching deserves a full review
surface. The builder also needed more workspace room, so the rigid sidebar became an actual
collapsible rail.

Decision:

- **Builder is configuration-only.** The header stepper now ends at `Save`; the builder keeps
  URL render, item/field selection, snapshot preview, and save. Live execution controls are no
  longer shown in the builder header or bottom panel.
- **Run Test owns live data review.** Saving a recipe routes to a dedicated Run Test screen
  with that recipe selected. Starting a test there selects the new run and gives it a review
  panel with status, duration, real extracted records, detailed new/changed/removed change rows,
  and CSV/JSON export actions. Runs remains cross-recipe history.
- **Sidebar folds.** `AppShell` now has a client-side collapsed state, compact wordmark
  fallback, icon-only navigation, and a chevron control so the builder can reclaim horizontal
  space.

Preserved: backend run/export APIs, SSE progress, snapshot preview behavior, and the no-code
builder principle.

## Follow-up 8 (2026-06-10) — topbar/URL-bar declutter + controls relocated

The user trimmed remaining topbar noise and asked to keep the URL bar reserved for future
URL-related features. README also needed the Harvestly logo for GitHub.

Decision:

- **Topbar recipe chip removed.** The editable recipe-name title and the `Draft`/`Saved` badge
  are gone from the builder topbar (the left grid column is now an empty spacer so the stepper
  stays centred). The recipe name still **auto-derives on render** (reducer `render_succeeded`
  → `suggestedName`), so Save (still gated on a non-empty name) keeps working without a visible
  field.
- **URL command bar left for the URL only.** Removed the `Page loaded` status pill (the
  transient `Loading page` cue stays) and moved the **List / Single** and **Item / Details**
  controls out of the command bar. The command-bar grid is now `url | loading-slot`.
- **Mode controls relocated to the inspector.** A small **Page** box at the top of the right
  panel (above the Item-pattern section) now holds List/Single (+ Item/Details for lists).
- **Removed the bottom preview-ready cue** ("Looking good! Save this recipe, then run it from
  Runs.") — redundant with the stepper + Save action. `HARVEST_ART.previewReady`
  (`table-harvest-ready.svg`) is no longer referenced and was pruned from the registry.
- **README shows the Harvestly logo.** Added `docs/harvestly-logo.png` (the uploaded wordmark)
  as a centred banner at the top of `README.md` for GitHub; a note clarifies the product brand
  is Harvestly while the codebase/repo/APIs keep the internal name ScrapTheWeb.

Preserved: no backend/API/reducer/extraction change; auto-naming, save, and run behavior intact.

## Follow-up 9 (2026-06-12) — Skrowt replaces Harvestly as the visible brand

The user provided two Skrowt logo designs and asked for the app to use this brand instead of
Harvestly while keeping the seed/plant theme.

Decision:

- **Primary brand:** the horizontal Skrowt wordmark is now the main sidebar/auth/README logo
  (`pics/skrowt-wordmark.png`, source `pics/skrowt-wordmark-source.jpg`) because it fits the
  existing rail and sign-in header.
- **Secondary brand use:** the icon/tagline composition is kept as a larger auth-side brand
  visual (`pics/skrowt-emblem.png`) and as a compact collapsed-sidebar icon
  (`pics/skrowt-icon.png`).
- **Theme preserved:** the harvest/seed/sprout motion assets and internal component names stay
  in place. Only the visible brand label and logo changed; the codebase/repo/API name remains
  ScrapTheWeb.

Preserved: no backend/API/reducer/extraction change.

## Follow-up 10 (2026-06-12) — user appearance controls

The user asked for night mode and custom colors from Settings. This is a user preference, not a
workspace contract yet, so it is stored locally rather than added to backend workspace settings.

Decision:

- **Settings → Appearance** adds Light/Night mode and color controls for the main accent, the
  sprout/plant color, and the warm paper/sidebar tint.
- **Application model:** `app/page.tsx` persists `scraptheweb.appearance.v1` in
  `localStorage`, applies `data-theme` to `document.documentElement`, and writes CSS variables
  for the custom colors.
- **Night mode:** `globals.css` now defines a dark token set under `html[data-theme="dark"]`.
  Common hardcoded white inline surfaces were converted to `var(--surface)` so the app does not
  keep bright panels in night mode.

Preserved: no backend/API/reducer/extraction change; preferences are per-device for now.

## Follow-up 11 (2026-06-12) — explicit builder-to-run hand-off

The builder/run split was correct, but saving a recipe immediately navigated away from the
builder. That made it hard for the user to understand the builder's final saved state and left
no obvious in-place action to move into live testing.

Decision:

- **Save stays in the builder.** Saving persists the recipe, marks the final Save step, selects
  that recipe for later testing, and does not automatically switch views.
- **Test run is always visible.** The builder topbar has a **Test run** action next to **Save
  recipe**. It is disabled until `savedRecipe` exists, then opens the dedicated **Run Test**
  page with the saved recipe selected.
- **No surprise execution.** The button only navigates to the run workspace; the user still
  starts the live fetch from the Run Test page.

Preserved: no backend/API/reducer/extraction change; live execution and exports remain outside
the builder.

## Follow-up 12 (2026-06-12) — saved runs honor single-page extraction scope

After the Run Test page became the live-data workspace, a saved run could complete with
`No records extracted` even though the builder preview had succeeded. The mismatch was in the
backend extraction contract: snapshot preview treats single-page recipes as page-wide, but the
saved-run HTML matcher still searched field selectors under the `body` container. Absolute
field selectors generated for single pages could therefore miss during the live run.

Decision:

- **`recipe_runner.extract_preview_rows` accepts `page_type`.** Listing remains unchanged:
  match item containers, then extract fields inside each container.
- **Single-page recipes are page-wide.** When `page_type == "single"` (or the container selector
  is the synthetic `body` selector), the runner extracts one row from the parsed document root.
- **Worker passes recipe shape.** `run_recipe` forwards saved config `pageType` (falling back to
  the recipe row) into the runner so the saved run uses the same shape contract as preview.
- **Regression coverage.** `test_recipe_runner.py` now covers an absolute single-page field
  selector against a `body` recipe.

Preserved: listing recipe extraction, frontend flow, API shape, and run/export surfaces.

## Follow-up 13 (2026-06-12) — preview rows match matched items

The builder could report more matched items than preview rows, for example **27 matches** but
only **20 preview rows**, because snapshot preview, the HTML runner, and the frontend table all
had fixed 20-row caps. That contradicted the user's expectation that match count and preview
count describe the same set.

Decision:

- **No hidden fixed preview cap.** `preview_from_snapshot` now returns every matched container by
  default. An explicit optional `limit` remains available only for callers/tests that ask for it.
- **Saved runs follow the same default.** `extract_preview_rows` now extracts every matched
  listing container by default, while still accepting an explicit optional limit.
- **Frontend renders all preview rows it receives.** The builder table no longer slices the
  preview to 20 rows.
- **Regression coverage.** The snapshot preview test now uses 27 cards so a 20-row cap fails
  visibly.

Preserved: single-page one-row preview/run behavior and the optional explicit limit parameter.

## Follow-up 14 (2026-06-12) — save guard + field selector coverage

The builder could still save the same unchanged recipe repeatedly, and Booking-style pages
showed another selector problem: 27 matched result cards, but only the first few preview rows
had field values because the relative field selector preferred a stable-looking class that
covered only part of the matched set.

Decision:

- **Unchanged saved recipes cannot be saved again.** Once `savedRecipe` exists, the builder
  topbar button changes from **Save recipe** to **Saved** and is disabled. The save handler also
  returns early if the current recipe is already saved.
- **Coverage beats stable-looking partial classes.** Relative field selector scoring now orders
  candidates by missing containers, then extra matches, then strategy rank and length. This
  favors selectors that extract one value from every matched card before selectors that only
  work on a subset.
- **Regression coverage.** Selector tests now model 27 cards where a class appears on only the
  first 6 field nodes; preview must still produce non-empty values for all 27 rows.

Preserved: the explicit Test run hand-off, one-row single-page behavior, and optional explicit
preview limits.

## Follow-up 15 (2026-06-12) — Skrowt/Sprout terminology cleanup

The visible brand is Skrowt, and the product concept previously called a "recipe" should now be
called a **sprout**: a saved extraction definition that can be tested and run.

Decision:

- **Visible UI says Sprout/Sprouts.** Builder actions, workspace navigation, Run Test labels,
  exports/help text, auth illustration labels, default generated names, and README copy now use
  Skrowt/Sprout language.
- **Old ScrapTheWeb visible names removed from product surfaces.** Local storage keys and export
  filenames use `skrowt.*` / `skrowt-run-*`; the FastAPI title is `Skrowt API`.
- **Internal contracts are deferred.** Type names, API routes, database tables, and persisted
  JSON fields still use `Recipe`/`recipes` where changing them would be a migration/API
  compatibility project.
- **Cleanup planned.** `docs/backlog/skrowt-internal-cleanup.md` tracks the migration-safe
  internal rename and simplification work, including remaining debug-only/dead branches.

Preserved: backend API compatibility, existing database schema, and saved run/export behavior.

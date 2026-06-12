# The Recipe Builder — current state

The builder is the visual, **no-code** workbench where a user turns a public URL into a
reusable extraction **recipe**: pick the repeating item, choose which fields to collect,
preview the screenshot snapshot, and save. Live test runs are started and reviewed on the
separate **Run Test** page. This file is the source of truth for how it works today.

> **Primary user = a non-coder.** The hard rule throughout the builder: **control comes from
> clicking, ticking, and toggling — never from typing CSS, regex, or other code.** No selector
> string is shown anywhere in the UI. (See "Design principles" below.)

---

## 1. End-to-end UI flow

```
Load URL ──▶ (render) ──▶ Pick an item ──▶ Choose fields ──▶ Preview records ──▶ Save
                            (list only)      (table / page)     (bottom panel)
```

The stepper is **derived from which state exists**, not stored — clearing downstream state is
how "go back" works (see §3).

### 1.1 Load the URL
The user types a URL and clicks **Reload page**. The backend renders it (see
[architecture.md](architecture.md)) and returns a screenshot + a flat list of DOM nodes +
scored "repeating-item" candidates. The screenshot is shown with clickable overlays on top.

### 1.2 Shape detection — List vs Single (automatic, overridable)
On render the builder decides the page **shape**:
- **list** if any container candidate scores ≥ `STRONG_CANDIDATE_SCORE` (40) — a page of
  repeating items (products, listings, search results);
- **single** otherwise — one record per page (a detail page).

A **Page: List / Single** segmented toggle lets the user correct a mis-detection. Flipping
shape clears the in-progress mapping because selectors differ by shape (list = relative to
the item; single = page-wide).

### 1.3 Pick an item (list pages)
The canvas shows the detected **candidate cards**; clicking one selects the repeating item.
The backend generates a selector for it and the UI outlines **every matched item** ("27
items"). The picked item is then the working scope.

If the first pick is wrong, the user can return to **Item** mode and click a different item.
Missed-item broadening is intentionally not part of the current UI.

### 1.4 Choose fields
Once an item is picked the builder shows, in the right panel, a **table of that item's data**
— every extractable value found inside the selected card, each with a friendly name:

| ✓ | name (editable) | value | type |
|---|-----------------|-------|------|
| ☐ | title           | iPhone 15 | Text |
| ☐ | title_link      | /p/iphone | Link |
| ☐ | price           | £799      | Text |

The user **ticks** what to collect (a **Select all** header checkbox — with an indeterminate
state when only some rows are ticked — toggles every row at once). Two equivalent ways,
**one shared selection** (so they can't conflict):
- **tick a row** in the table, or
- **click the value on the screenshot** — which surfaces *all* that element's attributes
  (Text / Link / Image) as grouped, highlighted rows so the user picks one or several (a
  linked title → `title` *and* `title_link`).

The **selected card is spotlighted** ("Editing this item") so it's unmistakable. Values shown
are the current item's own values, read from the render snapshot (instant). **Single pages**
have no card, so the user just clicks values on the page to add them (matched page-wide). The
single flow opens with a **"Page" anchor** in the inspector — the detail-page counterpart of
the list "Item" block (label, `Detail page` / `N details` badge, "Collecting from this page")
— and the fields card shows a real **empty state** ("Click a value on the page…") until the
first value is ticked (ADR 0010).

### 1.5 Preview records (the only thing that extracts)
Selecting fields extracts **nothing**. Clicking **Preview records** does one backend call that
generates each selected field's selector and extracts **all matched items** from the render
snapshot, showing them in the **bottom panel** table. Each column has an **×** to drop that
field. The preview row count follows the selector match count for list pages (for example,
27 matched cards → 27 preview rows); single pages preview one row. (Snapshot preview is fast
and is a *verification* view — values may be truncated to ~160 chars; the saved run produces
full values from fresh HTML.)

### 1.6 Save
**Save recipe** writes the recipe to the database — it is the **only** persistence in the
builder, and it's **disabled until a preview exists** (so the user always sees the data first).
Once the current recipe is saved, the button changes to **Saved** and is disabled so the same
unchanged recipe cannot be saved repeatedly. Editing upstream mapping state clears
`savedRecipe`, which makes saving available again for a changed recipe.
Running is intentionally outside the builder. The builder topbar keeps a **Test run** button
visible at all times, but it is disabled until the recipe has been saved. Saving keeps the
user on the builder in the final **Save** step; clicking **Test run** then opens the **Run
Test** page with that saved recipe selected. There, the user starts a live test; the worker
re-fetches the live page(s), extracts real data, persists records, computes diffs vs the
previous run, and offers CSV/JSON export.

### 1.7 Run Test page
The **Run Test** page is the live-data workspace. It has a saved-recipe picker, a **Run test**
button, a review panel with real extracted records, run status, duration, change counts,
detailed new/changed/removed rows, and CSV/JSON export actions. Recent tests for the selected
recipe remain below the review panel. The separate **Runs** page stays as cross-recipe
execution history.

---

## 2. Design principles (why it's shaped this way)

- **No code in the UI.** No CSS selector, regex, or developer term (`href`, `nth-child`, …) is
  ever shown or typed. Field types are **Text / Link / Image**. An earlier attempt to expose
  editable selectors was built and **rejected** for this reason (ADR 0009).
- **Pick by example, not by syntax.** The user teaches the first item/field by clicking it;
  the tool infers the selector from that example without showing selector syntax.
- **Progressive disclosure.** The one-click happy path stays simple; refinement (missed items,
  multi-attribute fields) appears only when needed.
- **Verify before commit.** Preview is a no-write dry run; the recipe DB write happens only on
  Save, and live data fetching is reviewed separately on Run Test.
- **One source of truth per concern.** The match count, the on-screenshot outline, and
  extraction all come from the same selector engine, so they can't disagree.

---

## 3. State machine (the reducer)

Builder flow state is a single `useReducer` — **not scattered `useState`** — so every
transition is atomic and the "clear everything downstream" rules live in one place.

- **File:** `frontend/lib/builder-reducer.ts` (pure, unit-tested in
  `frontend/lib/builder-reducer.test.ts`).
- **State (`BuilderState`):** `renderUrl`, `pageSession`, `selectedNode`, `selectorResult`,
  `recipeShape`, `pickMode`, `fields`, `fieldSamples`, `preview`, `recipeName`,
  `savedRecipe`, `run`, `imageSize`.
- **Key actions:** `render_succeeded` (seeds shape via `shapeFlow`), `container_selecting` /
  `container_selector_resolved` (pick/re-pick + auto-advance), `shape_changed`,
  `fields_added` (commit the selected fields at preview), `field_removed` (drop a preview
  column, **keeps** the preview), `preview_succeeded`, `recipe_saved`, `run_updated`,
  `step_navigated` (rewind by clearing downstream slices), `draft_restored` (resume after
  reload).
- **What's intentionally NOT in the reducer:** the screenshot blob URL (side-effect
  lifecycle), the local field **selection** (`selectedKeys` in the view), busy/error/auth
  state, the canvas view toggle — none have a cross-slice invariant.

### Field selection model (in the component, not the reducer)
- `selectedKeys: Set<"nodeId:extract">` — the shared selection toggled by **both** the table
  and screenshot clicks (`frontend/app/components/builder-view.tsx`).
- `discoveredFields` (auto-found in the card) + `clickedCandidates` (added by clicking) →
  `allCandidates`; `candidatesForNode` derives an element's Text/Link/Image candidates.
- On **Preview records**, `selectedFieldPicks()` resolves the selection to final, de-duped
  field names and hands them to the backend; the returned selectors become `state.fields`.

---

## 4. Selectors & extraction

Two distinct extractors, by design:

- **Snapshot matcher** (`backend/app/selector_generator.py`) — an in-house matcher over the
  **flat `domNodes` snapshot** (from Redis). Supports the grammar it emits: `>`-chained
  `tag` / `.class` / `#id` / `[attr="v"]` / `:nth-of-type(n)`. Powers selector **generation**
  (`generate_selector`) and the fast **snapshot preview** (`preview_from_snapshot`).
  For relative field selectors, candidates are scored by coverage first: a selector that fills
  every matched item wins over a "stable" class that only exists in a few cards. Snapshot
  preview returns one row per matched container for list pages; it does not apply a hidden
  fixed sample cap. Deliberately *not* a full CSS engine — see
  ADR 0001 D4 / 0007 D1.
- **HTML matcher** (`backend/app/recipe_runner.py`) — parses real HTML and runs the selectors;
  used by the **saved run** (and the legacy `/preview`), where full fidelity matters. Listing
  recipes extract fields inside each matched item container; single-page recipes extract one
  page-wide row so absolute field selectors generated during the builder preview still match
  during the saved run.

**Why the snapshot path is the preview path:** the render snapshot already holds every
element's text/href/src, so for *building and verifying* a recipe the data is available —
no S3 fetch, no HTML re-parse. The saved run still does the authoritative HTML extraction
against freshly-fetched pages.

**Performance note (current):** relative-selector matching precomputes each container's
descendants once per call and shares the `nodeId → node` map (avoids an O(nodes²) descendant
test). Preview extracts every matched list item so the row count agrees with the match count.

---

## 5. Files & responsibilities

### Frontend (`frontend/`)
| File | Responsibility |
|------|----------------|
| `app/page.tsx` | Orchestration: holds the reducer, all async handlers (render, pick, **preview**, save, run, export), draft persistence, SSE run progress. Builds `builderProps` and routes saved recipes/live runs to the Run Test view. |
| `app/components/builder-view.tsx` | The builder UI: canvas + overlays, shape toggle, item card, the **fields table** (selection), preview button, bottom preview-records panel, and the field **selection model** (`selectedKeys`, `candidatesForNode`, `discoveredFields`). |
| `app/components/product-screens.tsx` | Workspace screens outside the builder, including Run Test for real extracted records/change review/export and Runs for cross-recipe history. |
| `lib/builder-reducer.ts` | The flow state machine (§3). |
| `lib/api.ts` | Zod-validated API client + inferred types (`generateSelector`, `previewFromSnapshot`, `previewPageSession`, recipes, runs, exports, SSE `streamRunEvents`). |
| `app/components/ui.tsx`, `icons.tsx` | Design-system primitives (Button, Badge, Card, Segmented, Stepper, Tabs, …) and icons. |
| `app/components/animations/*` | Reusable, client-only **motion layer** (§9): result-outline pulse/reveal, animated field/preview rows, preview drawer, seed burst, sprout/loading art. Visual-only; respects reduced motion. |

### Backend (`backend/app/`)
| File | Responsibility |
|------|----------------|
| `page_sessions.py` | Page-session endpoints: render/create, `GET screenshot`, `POST /selector`, `POST /preview` (HTML), `POST /preview/snapshot` (fast). Loads `domNodes` from Redis, HTML from S3 (via the cache). |
| `selector_generator.py` | The snapshot matcher + `generate_selector` / `preview_from_snapshot` and helpers (`_matching_nodes`, `_matching_descendants`, `_descendants_by_container`, `_select_within`). |
| `recipe_runner.py` | `parse_html` + `select_nodes` + `extract_preview_rows` — authoritative HTML extraction for runs; honors listing vs single-page extraction scope. |
| `worker.py` | arq worker: Playwright render → `render_scripts/dom_candidates.js` (capture DOM + candidates) → consent/overlay reduction → ad/tracker blocking → `_wait_for_dom_stable`; writes screenshot+HTML to S3, payload to Redis. |
| `page_html_cache.py` | Best-effort in-process TTL+LRU cache of page HTML (ADR 0008). |
| `overlay_reduction.py` | Consent/cookie overlay dismissal patterns. |
| `recipes.py`, `runs`/exports, `limits.py`, `ssrf.py` | Recipe CRUD, run/export, rate limits & quotas, SSRF guards on render URLs. |

### Render capture (`backend/app/render_scripts/dom_candidates.js`)
Runs in the page: builds the flat `domNodes` (every visible element with `tag`, `text`
[≤160 chars], `attrs` [`id/class/role/itemprop/href/src/data-*`], `classes`, `parentNodeId`,
geometry) and the scored repeating-card candidates. nodeIds (`node-<index>`) tie candidates,
selectors, and the on-screen overlays together.

---

## 6. Data flow — what's written, and when

Nothing is written to the DB/storage while picking fields or previewing. Two write moments:

- **Render** → `screenshot.png` + `page.html` to **S3**; `domNodes` + candidates to **Redis**
  (TTL); a `PageSession` row to **Postgres**.
- **Save recipe** → the recipe (item selector + fields) to **Postgres**.

Between them: selector generation / snapshot preview read `domNodes` from **Redis**; the
field selection lives in the component + a `localStorage` draft (resume-after-reload). The
saved **run** re-fetches live HTML and extracts fresh.

---

## 7. Concepts behind the implementation (worth knowing)

- **Finite state machine / reducer pattern** — modeling the builder flow as
  `(state, action) → state`; why deriving the step from data beats a stored step counter.
- **Programming by example / inductive selection** — inferring a selector from a clicked
  item or field example.
- **Snapshot vs authoritative extraction** — a fast, lossy in-memory view for building vs the
  faithful HTML extraction for the real run; why both exist.
- **Heuristic vs authoritative data** — the match count/outline come from the real matcher,
  not a client-side guess (the early tag/class heuristic survives only for the synthetic
  single-page `body` selector).
- **Progressive disclosure & desire lines** — the happy path is one click; power features are
  there but out of the way.
- **Local-first autosave** — `localStorage` draft; the screenshot blob URL can't be
  serialized, so it's re-fetched from the session on restore.
- **SSRF safety** — render URLs are validated before fetch (`ssrf.py`).

---

## 8. Builder improvements for production

See [production-readiness.md](production-readiness.md) for the full list. Builder-specific
highlights:

- **Server-side recipe drafts** (today drafts are `localStorage`, per-tab only).
- **Field transforms** (trim / number / date / regex-free presets) — post-process values.
- **Pattern refinement** for cases where the first item pick misses or over-includes cards.
- **Per-card confidence strip** in the field editor (show a value sampled from several cards).
- **Pagination / multi-page crawl** for runs (today single-page render).
- **Parsed-DOM cache** for the legacy HTML preview/run path (ADR 0008 deferred follow-up).
- **Multilingual consent/overlay coverage** for international sites.

---

## 9. Skrowt brand + harvest motion layer — ADR 0011

The builder wears the **Skrowt** brand: monochrome ink-on-paper, monospace, quiet — plus a
reusable **motion layer** that gives calm feedback at meaningful product moments. The motion is
**visual-only** (state lives in the view via `useState`/`useEffect`, **never in the reducer**),
built on `motion` (`motion/react`); every piece respects `prefers-reduced-motion`.

### Theme (the "mood")
- **Palette (`globals.css :root`):** monochrome — near-black ink accent, paper-white surfaces,
  thin warm-grey borders, neutral-ink `--info`. The only chromatic note is a muted **`--sprout`**
  green (+ **`--soil`** brown), reserved for harvest/seed motifs and success. Because the app is
  token-driven, the re-skin is mostly this `:root` change; the few hardcoded builder overlay
  colours + the avatar palette were recoloured to ink too.
- **Section surfaces:** sidebar uses a quiet warm paper, builder header/command/footer share a
  slightly warmer tint, the screenshot canvas is a textured dotted work area, and the inspector
  remains a clean pale panel. This lets users distinguish navigation, controls, canvas, data
  picking, and preview without adding bright chrome.
- **Type:** **Inconsolata** everywhere (`layout.tsx` font link, `--font-sans`/`--font-mono`);
  Geist Mono is the fallback.
- **Brand + shell:** the builder uses a builder-first Skrowt workbench shell: the uploaded
  Skrowt wordmark, a small "turn websites into structured data" tagline, Builder-first nav,
  and no generic dashboard header above the builder. This is a *visible-label* change only —
  there is **no** internal/global rename (the codebase, repo, and APIs stay ScrapTheWeb).
- **Appearance preferences:** Settings → Appearance lets the user choose **Light** or
  **Night** mode and customize the main accent, plant/sprout color, and paper/sidebar tint.
  These preferences are local to the device (`localStorage`) and applied by `app/page.tsx`
  through `data-theme` plus CSS variables on `document.documentElement`.

### Art assets (provided kit)
The illustrations come from the design team's kit in **`frontend/public/harvest-assets/`**
(`animated/*.svg` self-animate via internal CSS + ship their own reduced-motion handling;
`pics/*.svg` are static). They are rendered as plain `<img>` through the
**`HarvestArt`** component (`HARVEST_ART` is a tight registry of the names actually wired in:
`sproutGrow`, `collecting`, `dataFlowToTable`, `stepComplete`, `emptyStateGrow`, `seedTrail`,
`logo`, `dataRows`, `emptyCard`, `fieldLink`, `fieldImage`, `fieldText` — the kit holds more
SVGs; add a key when one is used). `currentColor` inside an `<img>` resolves to
ink, matching the monochrome palette. Placements: primary sidebar/auth brand
(`pics/skrowt-wordmark.png`, derived from the uploaded `pics/skrowt-wordmark-source.jpg`,
referenced directly), secondary auth brand visual (`pics/skrowt-emblem.png`), collapsed-sidebar
icon (`pics/skrowt-icon.png`), small sprout mark (`pics/sprout-logo.svg`),
stepper terminus (`animated/animated-sprout-grow.svg`), stepper completed-step and seed-trail moments, field
row chips (`pics/field-chip-*.svg`), empty preview
state (`pics/empty-state-sprout-card.svg`), page/screenshot loading
(`animated/animated-collecting-data.svg`), preview extraction loading
(`animated/animated-data-flow-to-table.svg`), the `Data to collect` heading (`logo`), and the
TIP card (`pics/data-rows-sprout.svg`). The earlier hand-drawn `SproutIcon`/`SproutInSoil`
components were removed in favour of this kit.

### Motion + components
- **Files:** `frontend/app/components/animations/*` (one component per file, re-exported from
  `index.ts`); `globals.css` has the `seed-drift` keyframe + a reduced-motion override.
  Integrated only inside `builder-view.tsx` (+ brand mark in `app-shell.tsx`).
- **What animates, and on which existing state:**
  - **HarvestStepper** — the `LOAD → PICK → CHOOSE → PREVIEW → SAVE` stepper in the builder
    header (replaces the generic `Stepper`): numbered `1–5` circles joined by thin connectors
    (the completed segment darkened), labels beneath, only the current step filled ink; a sprout
    illustration set beside it. Driven by `currentStep`; active circle pulses, connector fill
    animates, and a seed-trail asset travels across the latest completed connector.
  - **Selected result pulse + matched-set reveal** — `AnimatedResultOutline`, container-mode
    `selectedNode` + `matchedNodeIds`. (In container mode the overlay buttons stop drawing those
    borders so they aren't painted twice; click behaviour is untouched.)
  - **"Data to collect" rows** — `AnimatedFieldRow` under `<AnimatePresence>`; rows animate
    in/out/reorder.
  - **Preview table** — `AnimatedPreviewDrawer` (slide-up when `previewRows` exist) +
    `AnimatedPreviewRow` (rows fade/rise, staggered).
  - **Loading states** — while the page/screenshot is rendering, `BuilderScreenshotLoading`
    shows `animated-collecting-data.svg` over the canvas (or as the initial canvas state); while
    preview rows are being generated, `BuilderPreviewLoading` shows
    `animated-data-flow-to-table.svg` in the bottom preview panel.
  - **Harvest success motifs** — `SeedBurst` (one-shot soil-coloured scatter on preview success);
    sprout art (via `HarvestArt`) on the preview-ready cue, the empty preview state, and the
    "Saved" badge.
- **Friendly copy:** plain-language moments — "Click one result to teach the pattern" → "Great!
  We found N similar results" → "Looking good! Save this recipe, then run it from Run Test."
- **Friendly field names (display-only):** `isUglyGeneratedName` shows a *"Rename this field"*
  placeholder for auto names like `field_1` / `text_title3`. It **never** changes the internal
  key or the committed field name — purely a UI prompt.
- **Tuning / removal:** durations and springs live inside each component. Reverting the theme =
  restore the `:root` palette + font tokens (and copy strings); deleting the `animations/`
  imports + wrappers in `builder-view.tsx` reverts to the static builder. No GSAP/Lottie.

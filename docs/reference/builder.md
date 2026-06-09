# The Recipe Builder — current state

The builder is the visual, **no-code** workbench where a user turns a public URL into a
reusable extraction **recipe**: pick the repeating item, choose which fields to collect,
preview the data, save, and run. This file is the source of truth for how it works today.

> **Primary user = a non-coder.** The hard rule throughout the builder: **control comes from
> clicking, ticking, and toggling — never from typing CSS, regex, or other code.** No selector
> string is shown anywhere in the UI. (See "Design principles" below.)

---

## 1. End-to-end UI flow

```
Load URL ──▶ (render) ──▶ Pick an item ──▶ Choose fields ──▶ Preview records ──▶ Save ──▶ Run
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

**Missed items (teach-by-example).** If detection missed some cards, the user switches to
**Item** mode and **clicks the missed ones**. Already-detected items are **frozen** (outlined,
not interactive) so only genuinely-missed regions are clickable; each click adds an *example*
and the selector is re-inferred to cover all examples. "Start over" re-picks from the first.

### 1.4 Choose fields
Once an item is picked the builder shows, in the right panel, a **table of that item's data**
— every extractable value found inside the selected card, each with a friendly name:

| ✓ | name (editable) | value | type |
|---|-----------------|-------|------|
| ☐ | title           | iPhone 15 | Text |
| ☐ | title_link      | /p/iphone | Link |
| ☐ | price           | £799      | Text |

The user **ticks** what to collect. Two equivalent ways, **one shared selection** (so they
can't conflict):
- **tick a row** in the table, or
- **click the value on the screenshot** — which surfaces *all* that element's attributes
  (Text / Link / Image) as grouped, highlighted rows so the user picks one or several (a
  linked title → `title` *and* `title_link`).

The **selected card is spotlighted** ("Editing this item") so it's unmistakable. Values shown
are the current item's own values, read from the render snapshot (instant). **Single pages**
have no card, so the user just clicks values on the page to add them (matched page-wide).

### 1.5 Preview records (the only thing that extracts)
Selecting fields extracts **nothing**. Clicking **Preview records** does one backend call that
generates each selected field's selector and extracts **all matched items** from the render
snapshot, showing them in the **bottom panel** table. Each column has an **×** to drop that
field. (Snapshot preview is fast and is a *verification* view — values may be truncated to
~160 chars; the saved run produces full values from fresh HTML.)

### 1.6 Save & Run
**Save recipe** writes the recipe to the database — it is the **only** persistence in the
builder, and it's **disabled until a preview exists** (so the user always sees the data first).
**Run** executes the recipe: the worker re-fetches the live page(s) and extracts real data,
persists records, computes diffs vs the previous run, and offers CSV/JSON export.

---

## 2. Design principles (why it's shaped this way)

- **No code in the UI.** No CSS selector, regex, or developer term (`href`, `nth-child`, …) is
  ever shown or typed. Field types are **Text / Link / Image**. An earlier attempt to expose
  editable selectors was built and **rejected** for this reason (ADR 0009).
- **Pick by example, not by syntax.** When the auto-pick is wrong, the user fixes it by
  **clicking more examples** (items or field values); the tool infers the pattern.
- **Progressive disclosure.** The one-click happy path stays simple; refinement (missed items,
  multi-attribute fields) appears only when needed.
- **Verify before commit.** Preview is a no-write dry run; the DB write happens only on Save.
- **One source of truth per concern.** The match count, the on-screenshot outline, and
  extraction all come from the same selector engine, so they can't disagree.

---

## 3. State machine (the reducer)

Builder flow state is a single `useReducer` — **not scattered `useState`** — so every
transition is atomic and the "clear everything downstream" rules live in one place.

- **File:** `frontend/lib/builder-reducer.ts` (pure, unit-tested in
  `frontend/lib/builder-reducer.test.ts`).
- **State (`BuilderState`):** `renderUrl`, `pageSession`, `selectedNode`, `selectorResult`,
  `containerExampleIds` (item teach-by-example), `recipeShape`, `pickMode`, `fields`,
  `fieldSamples`, `preview`, `recipeName`, `savedRecipe`, `run`, `imageSize`.
- **Key actions:** `render_succeeded` (seeds shape via `shapeFlow`), `container_selecting` /
  `container_selector_resolved` (first pick + auto-advance), `container_example_added` /
  `container_selector_inferred` (missed-items), `shape_changed`, `fields_added` (commit the
  selected fields at preview), `field_removed` (drop a preview column, **keeps** the preview),
  `preview_succeeded`, `recipe_saved`, `run_updated`, `step_navigated` (rewind by clearing
  downstream slices), `draft_restored` (resume after reload).
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
  (`generate_selector`), teach-by-example **inference** (`infer_selector`), and the fast
  **snapshot preview** (`preview_from_snapshot`). Deliberately *not* a full CSS engine — see
  ADR 0001 D4 / 0007 D1.
- **HTML matcher** (`backend/app/recipe_runner.py`) — parses real HTML and runs the selectors;
  used by the **saved run** (and the legacy `/preview`), where full fidelity matters.

**Why the snapshot path is the preview path:** the render snapshot already holds every
element's text/href/src, so for *building and verifying* a recipe the data is available —
no S3 fetch, no HTML re-parse. The saved run still does the authoritative HTML extraction
against freshly-fetched pages.

**Performance note (current):** relative-selector matching precomputes each container's
descendants once per call and shares the `nodeId → node` map (avoids an O(nodes²) descendant
test). A 200-card page previews in ~70 ms.

---

## 5. Files & responsibilities

### Frontend (`frontend/`)
| File | Responsibility |
|------|----------------|
| `app/page.tsx` | Orchestration: holds the reducer, all async handlers (render, pick, infer, **preview**, save, run, export), draft persistence, SSE run progress. Builds `builderProps`. |
| `app/components/builder-view.tsx` | The builder UI: canvas + overlays, shape toggle, item card + missed-items, the **fields table** (selection), preview button, bottom results panel (records/changes/logs), and the field **selection model** (`selectedKeys`, `candidatesForNode`, `discoveredFields`). |
| `lib/builder-reducer.ts` | The flow state machine (§3). |
| `lib/api.ts` | Zod-validated API client + inferred types (`generateSelector`, `inferSelector`, `previewFromSnapshot`, `previewPageSession`, recipes, runs, exports, SSE `streamRunEvents`). |
| `app/components/ui.tsx`, `icons.tsx` | Design-system primitives (Button, Badge, Card, Segmented, Stepper, Tabs, …) and icons. |

### Backend (`backend/app/`)
| File | Responsibility |
|------|----------------|
| `page_sessions.py` | Page-session endpoints: render/create, `GET screenshot`, `POST /selector`, `POST /selector/infer`, `POST /preview` (HTML), `POST /preview/snapshot` (fast). Loads `domNodes` from Redis, HTML from S3 (via the cache). |
| `selector_generator.py` | The snapshot matcher + `generate_selector` / `infer_selector` / `preview_from_snapshot` and helpers (`_matching_nodes`, `_matching_descendants`, `_descendants_by_container`, `_select_within`). |
| `recipe_runner.py` | `parse_html` + `select_nodes` + `extract_preview_rows` — authoritative HTML extraction for runs. |
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

Between them: selector gen / inference / snapshot preview read `domNodes` from **Redis**; the
field selection lives in the component + a `localStorage` draft (resume-after-reload). The
saved **run** re-fetches live HTML and extracts fresh.

---

## 7. Concepts behind the implementation (worth knowing)

- **Finite state machine / reducer pattern** — modeling the builder flow as
  `(state, action) → state`; why deriving the step from data beats a stored step counter.
- **Programming by example / inductive selection** — inferring a general selector from a few
  positive examples (items or field cells).
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
- **Exclude / negative examples** for item teach-by-example (today include-only).
- **Per-card confidence strip** in the field editor (show a value sampled from several cards).
- **Pagination / multi-page crawl** for runs (today single-page render).
- **Parsed-DOM cache** for the legacy HTML preview/run path (ADR 0008 deferred follow-up).
- **Multilingual consent/overlay coverage** for international sites.

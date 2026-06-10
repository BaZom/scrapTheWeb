# CLAUDE.md — ScrapTheWeb

Visual recipe builder for extracting structured data from public listing/detail pages.
Next.js frontend (auth, visual picker, field mapping, preview, runs, exports) · FastAPI
backend (tenant auth, recipe/run APIs, limits, SSRF guards) · arq worker (Playwright
render + extraction) · Postgres · Redis · S3-compatible storage. See `README.md`.

## Commands
- **Run the stack:** `docker compose up --build` (frontend :3000, API :8000, worker
  metrics :9100, MinIO :9001).
- **Backend tests/lint** (host python lacks pytest/ruff — use the container):
  `docker compose run --rm --no-deps api pytest -q` · `... ruff check app`.
  Host `python3` *does* have `playwright` (render diagnostics) and can import pure modules
  like `app.selector_generator` directly.
- **Frontend** (`cd frontend`): `npm test` (Vitest) · `npm run typecheck` · `npm run lint`
  · `npm run build`. Note: `next lint` rewrites `next-env.d.ts` (it has an intentional
  custom comment) — `git checkout -- frontend/next-env.d.ts` after linting.
- There is a Vitest harness now; **pure logic must have tests** (reducer, selector logic).
  Components/full flows are still verified by running the stack (jsdom env exists for
  future component tests).

## Conventions
- **Keep all persistent context local and in-repo** — this `CLAUDE.md` and `docs/`. Do NOT
  use the `.claude` memory store; the user wants nothing kept outside the repo.
- **Two doc layers, both kept current:**
  - **`docs/adr/`** = *history* (numbered, append-only, dated). Read the relevant ADR before
    changing an area; add/extend an ADR for non-trivial work (what / why / rejected
    alternatives / "concepts to look up"). Never rewrite an ADR to reflect later changes.
  - **`docs/reference/`** = *current-state source of truth* (no history). Describes how the
    app works **now** — features, UI flows, architecture, files, concepts, production gaps.
    **When you change a feature/flow/file-layout/concept it covers, update the matching
    `docs/reference/` file in the SAME commit.** New major areas get their own file there.
  - **`docs/backlog/`** = *to-do* (open bugs + specific planned work, one file per item). Pull
    next work from here; when an item ships, record the why in an ADR, update the matching
    reference file, and close/remove the backlog item.
  - So a non-trivial change typically touches **both**: the ADR (why, in this commit) and the
    reference file (the new current truth, in this commit).
- **Small, isolated commits**, one logical change each. Commit pre-existing uncommitted
  work separately *before* starting new work.
- **Do NOT add a Co-Authored-By / "Claude Opus" trailer** to commit messages (user
  preference).
- `scratch/` and `IMPLEMENTATION_STATUS.md` are **gitignored** (local diagnostics / status).
- `frontend/package-lock.json` **is committed** (locks the full transitive tree + integrity
  hashes for reproducible installs; exact pins in `package.json` only cover direct deps).

## Architecture quick map
- **Render → DOM nodes + scored candidates:** `backend/app/worker.py` renders, runs
  `render_scripts/dom_candidates.js`, dismisses consent overlays
  (`overlay_reduction.py`), blocks ad/tracker requests (`RENDER_BLOCK_ADS`), and waits for
  consent-rebuild via `_wait_for_dom_stable`.
- **Selector generation:** `backend/app/selector_generator.py` (`generate_selector`
  returns `selector/matchCount/strategy/matchedNodeIds`). Preview extraction:
  `recipe_runner.py` (`extract_preview_rows`) over the saved HTML.
- **Builder UI:** `frontend/app/page.tsx` (orchestration) drives `components/builder-view.tsx`.
  Builder flow state is a reducer: `frontend/lib/builder-reducer.ts` (tested in
  `builder-reducer.test.ts`) — dispatch actions, don't add scattered useState. Run progress
  streams via SSE (`streamRunEvents` in `lib/api.ts`) with a polling fallback.

## Data flow — where things are saved (and when)
Important for reasoning about "stale/wrong data": **nothing is written to DB/storage while
building fields or previewing.** Only two write moments:
- **Render** → `screenshot.png` + `page.html` to **S3**; the DOM payload (`domNodes` +
  candidates) to **Redis** (TTL); a `PageSession` row to **Postgres**.
- **Save recipe** → the recipe (selector + fields) to **Postgres**.
Between them: selector gen reads `domNodes` from Redis; **preview re-reads the HTML from S3
and re-extracts every call** (no write); field mapping lives in the reducer + a
`localStorage` draft. Preview-from-snapshot is deterministic and matches the screenshot —
that's intended, not a bug.

## Status
- **Phase 1** (ADR 0001) and the universal/reliability ADRs (0002–0006) are done.
- **Phase 2 (ADR 0007) — DONE:** authoritative `matchedNodeIds`, builder draft persistence,
  SSE run progress, and the `page.tsx` state-machine reducer (+ Vitest harness).
- **Builder smoothness fix — DONE:** `fields_changed` clears the stale preview (removing a
  field no longer shows old columns); drafts persist *immediately* on structural changes
  (debounce only for text), so a fast reload can't lose an edit.
- **Phase 3 — Shape override — DONE (ADR 0005 follow-up):** a `Page: List / Single` toggle
  in `builder-view.tsx`, driven by a new `shape_changed` reducer action (+ tests). Lets the
  user correct mis-detection (single-item detail pages with an incidental repeated strip
  read as lists). Flipping clears the downstream flow (selectors differ by shape — list is
  relative, single is page-wide) and reuses the `shapeFlow(shape)` helper that
  `render_succeeded` also uses, so manual/auto can't drift. Frontend-only. Manually verified:
  the win shows on single-item pages; no visible change on already-correct list pages (by
  design — it's a corrective escape hatch).
- **Teach-by-example (ADR 0009) — core kept, broadening retired:** first-pick → generate the
  repeated selector → choose fields is the live flow. The *missed-item broadening* (clicking
  extra examples to widen a match; backend `infer_selector` + `POST .../selector/infer`;
  reducer `container_example_*` actions) was **removed** in ADR 0009 follow-up 3. A wrong pick →
  return to Item mode and pick a different item. No CSS selector is shown anywhere.
- **Harvestly redesign (ADR 0011) — DONE:** monochrome ink-on-paper + Inconsolata theme;
  `HarvestStepper`; the provided art kit in `frontend/public/harvest-assets/` rendered via
  `HarvestArt` (+ the `HARVEST_ART` registry); builder-first shell (collapsible sidebar,
  wordmark, no generic header); animated loading/preview states. The builder is now
  **config-only** — live execution + review live on the **Runs** page (ADR 0011 follow-up 7).
  Visual/shell only; no extraction/API change. `next build` + tests green; verified against the
  design reference via a host-dev + Playwright screenshot loop.

## Next: Phase 3 (continue here next time)
Shape override (item 1) is done. Remaining, in suggested order:

1. **Field transforms** — post-process extracted values (trim, regex, parse number/date).
   Touches `recipe_runner.py` extraction + the worker, and a per-field config UI.

**Selector editing — TRIED AND REMOVED (do NOT rebuild without an explicit ask).** An early
attempt exposed editable CSS selector boxes; the user rejected it — raw CSS is complexity for
the **non-coding primary users**; the tool must stay "magic"/click-and-go. Reverted in full.
**Standing design principle: no CSS/regex/code-shaped inputs in the default builder UI; keep
technical machinery hidden from non-coders.**

**Teach-by-example selection (ADR 0009) — current state.** No-code first pick: the user clicks
one item, the backend generates the repeated selector, and the user ticks which values
(Text/Link/Image) to collect — friendly tick options showing only values present on the
element; tick several to take multiple values from one element (`fields_added` reducer
action). The CSS selector is never shown. The **missed-item broadening** (clicking extra
examples to widen the match) was **removed** in ADR 0009 follow-up 3: a wrong pick →
return to Item mode and pick a different item. Don't rebuild broadening without an explicit
ask. (Possible future, only if asked: exclude/negative examples; per-card confidence strip.)

Parked/external: `docs/backlog/api-connections.md` (untracked) — an "API Connection" data-source
idea, not created by the builder work; left as-is.

Possible UX follow-up to shape override (only if the user asks): mis-detection is still
*passive* — the user must notice the wrong shape and flip the toggle themselves. A small
inline nudge when detection is uncertain ("Detected a list of N items — not a list? Switch
to Single") would make the fix discoverable. Keep it a hint, not a panel — do NOT grow it
into the parked assistant.

Perf follow-up — **DONE (ADR 0008):** preview re-fetched + re-parsed the full HTML from S3
on every call. Added a best-effort, per-replica in-process TTL+LRU cache (`page_html_cache.py`)
in front of S3, keyed by `html_key`, wired into `_load_page_session_html`. S3 stays the
durable source of truth; miss/restart/eviction/disabled all fall back to the identical S3
read. Configurable via `PAGE_HTML_CACHE_*`. Caching the *parsed* DOM (not just raw HTML) is
the next perf step if parse time dominates — deliberately deferred.

Also parked: a **heuristic builder assistant** (detect the repeating item, panel UX) was
prototyped and removed at the user's request; it can be revisited on the reducer base —
but only when the user asks. Do not reintroduce an assistant unprompted.

When picking up Phase 3, re-read ADR 0001 (the backlog), ADR 0005 (shape detection), and
ADR 0007 (the reducer), then confirm scope with the user before building.

# CLAUDE.md — Skrowt

Visual sprout builder for extracting structured data from public listing/detail pages.
Next.js frontend (auth, visual picker, field mapping, preview, runs, exports) · FastAPI
backend (tenant auth, saved-sprout/run APIs, limits, SSRF guards) · arq worker (Playwright
render + extraction) · Postgres · Redis · S3-compatible storage. See `README.md`.

## Commands
- **Run the stack:** `docker compose up --build` (frontend :3000, API :8000, worker
  metrics :9100, MinIO :9001).
- **Backend tests/lint** (host python lacks pytest/ruff — use the container):
  `docker compose run --rm --no-deps -v "$PWD/backend:/app" api pytest -q` · `... ruff check .`.
  Host `python3` *does* have `playwright` and can import pure modules like `app.selector_generator`.
- **Frontend** (`cd frontend`): `npm test` (Vitest) · `npm run typecheck` · `npm run lint`
  · `npm run build`. Note: `next lint` rewrites `next-env.d.ts` (it has an intentional
  custom comment) — `git checkout -- frontend/next-env.d.ts` after linting.
- **Pure logic must have tests** (reducer, selector logic). Components/full flows are verified
  by running the stack (a jsdom Vitest harness exists for future component tests).

## Conventions
- **Keep all persistent context local and in-repo** — this `CLAUDE.md` and `docs/`. Do NOT
  use the `.claude` memory store; the user wants nothing kept outside the repo.
- **Three doc layers, all kept current:**
  - **`docs/adr/`** = *history* (numbered, append-only, dated). Read the relevant ADR before
    changing an area; add/extend an ADR for non-trivial work (what / why / rejected
    alternatives). Never rewrite an ADR to reflect later changes.
  - **`docs/reference/`** = *current-state source of truth* (no history). When you change a
    feature/flow/file-layout/concept it covers, update the matching file in the SAME commit.
  - **`docs/backlog/`** = *to-do* (one file per item). Pull next work from here; when an item
    ships, record the why in an ADR, update the reference file, and close/remove the item.
  - So a non-trivial change typically touches **both** the ADR (why) and the reference (current
    truth) in the same commit. (`AGENTS.md` mirrors these rules for non-Claude agents — keep
    the two in sync if you change conventions.)
- **Context efficiency:** when continuing in the same thread, rely on existing context — don't
  broadly reread the same docs each turn. Use targeted reads (`rg -n`, then `sed -n`/`nl -ba`
  around exact lines); avoid whole-file reads and large diffs unless needed.
- **Small, isolated commits**, one logical change each. Commit pre-existing uncommitted work
  separately *before* starting new work.
- **Do NOT add a Co-Authored-By / agent trailer** to commit messages (user preference).
- `scratch/` and `IMPLEMENTATION_STATUS.md` are **gitignored**. `frontend/package-lock.json`
  **is committed** (locks the full transitive tree + integrity hashes).

## Architecture quick map
- **Render → DOM nodes + scored candidates:** `backend/app/worker.py` renders, runs
  `render_scripts/dom_candidates.js`, dismisses consent overlays (`overlay_reduction.py`),
  blocks ad/tracker requests (`RENDER_BLOCK_ADS`), waits for consent-rebuild via
  `_wait_for_dom_stable`.
- **Selectors/preview:** `backend/app/selector_generator.py` (`generate_selector` →
  selector/matchCount/strategy/matchedNodeIds; honors `page_type`/single-page scope) and
  `recipe_runner.py` (authoritative HTML extraction for saved runs). Endpoints in
  `backend/app/page_sessions.py`.
- **Builder UI:** `frontend/app/page.tsx` (orchestration) drives `components/builder-view.tsx`;
  flow state is a reducer in `frontend/lib/builder-reducer.ts` (don't add scattered useState);
  API client in `lib/api.ts`. Run progress streams via SSE (`streamRunEvents`) with polling
  fallback. Visual/animation state stays in the view, **never** the reducer.

## Data flow — where things are saved (and when)
Important for reasoning about "stale/wrong data": **nothing is written to DB/storage while
building fields or previewing.** Two write moments: **Render** → `screenshot.png` + `page.html`
to S3, `domNodes` + candidates to Redis (TTL), a `PageSession` row to Postgres. **Save sprout**
→ the sprout to Postgres. Build-time selector gen/preview read the snapshot from Redis/S3; the
saved **run** re-fetches live HTML. Preview-from-snapshot is deterministic and matches the
screenshot — intended, not a bug.

## Status & next
- **Current behavior** → `docs/reference/` (builder, architecture). **Why/history** →
  `docs/adr/` (current through **ADR 0012**: data-collection strategy — where extraction runs +
  rejected alternatives; ADR 0011 = Skrowt redesign + builder follow-ups 1–15).
  **Next work** → pull from `docs/backlog/`.

## Standing guardrails (don't relearn the hard way)
- **No code in the builder UI.** No CSS/regex/selector strings or dev terms (`href`,
  `nth-child`, …) shown or typed — the non-coder corrects **by example** (clicking more
  items/values). Editable-selector boxes were built and **rejected**; don't rebuild without an
  explicit ask.
- **Teach-by-example broadening was removed** (ADR 0009 FU3): a wrong pick → re-pick a
  different item. Don't re-add missed-item broadening unprompted.
- **A heuristic builder assistant** was prototyped and removed — don't reintroduce unprompted.
- The builder is **config-only**; live execution + review live on the **Runs** page.

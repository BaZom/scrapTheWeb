# AGENTS.md — Skrowt

Conventions for AI agents (Codex and others) working in this repo. Visual sprout builder for
extracting structured data from public listing/detail pages: Next.js frontend · FastAPI API ·
arq + Playwright worker · Postgres · Redis · S3/MinIO.

## Codex context loading (token budget)

Keep each session small and targeted:

- **Default entrypoint:** this `AGENTS.md`. Do **not** read `CLAUDE.md` by default; it mirrors
  these conventions for Claude. Read it only when explicitly asked or when changing agent
  instructions.
- **Strategy / "what next" / feature priority:** read only the top of
  `docs/reference/product-strategy.md` first, especially **Current focus / next action**. Use
  `rg -n` to jump to more sections only when needed.
- **Implementation task:** read the one matching backlog item, then the smallest relevant
  section of `docs/reference/builder.md` or `docs/reference/architecture.md`. Read the relevant
  ADR only for non-trivial behavior/architecture changes or when the backlog item points to it.
- **Do not start sessions by broadly reading** `docs/reference/README.md`,
  `docs/backlog/README.md`, all ADRs, or full technical references. Use those indexes only
  when the task area is unclear.
- Prefer targeted reads: `rg -n` for the symbol/section, then `sed -n`/`nl -ba` around exact
  lines. Avoid whole-file reads and large `git diff` dumps unless genuinely needed.
- Prefer focused tests/checks first. Run broader checks when the change touches shared types,
  build configuration, extraction contracts, or broad UI behavior.
- If persistent working notes are useful, keep them local/in-repo under ignored `scratch/`
  rather than re-deriving context from docs and diffs on every follow-up.

## Documentation rules (important)

Three doc layers, **all kept current**:

- **`docs/adr/`** = *history*. Numbered, append-only, dated Architecture Decision Records:
  what changed and **why**, with rejected alternatives. Read the relevant ADR before changing
  an area. Add/extend an ADR for non-trivial work. **Never** rewrite an ADR to reflect later
  changes — it is a historical record.
- **`docs/reference/`** = *current-state source of truth* (no history). How the app works
  **now**: features, UI flows, architecture, files, concepts, production gaps. **When you
  change a feature, flow, file layout, or concept it documents, update the matching
  `docs/reference/` file in the SAME commit.** New major areas get their own file there.

- **`docs/backlog/`** = *to-do*. Open bugs and specific planned work, one file per item.
  Pull next work from here; when an item ships, record the *why* in an ADR, update the
  matching `docs/reference/` file, and remove/close the backlog item.

So a non-trivial change usually touches the ADR (the *why*) and the reference file (the new
*current truth*) in the same commit.

**For the business model, the four-source architecture, and the strict roadmap / current
focus, read `docs/reference/product-strategy.md` first** (the *why* is ADR 0013). Each fact
lives in exactly one layer — business+plan there, tech in `architecture.md`/`builder.md`, why
in ADRs, market in `target-site-landscape.md` — so a Codex session orients from this file →
`product-strategy.md` and dips into a technical ref only when the task needs it.

## Product principle (load-bearing)

The **primary user is a non-coder**. In the builder UI, **control comes from clicking,
ticking, and toggling — never from typing CSS, regex, or other code**. No selector string or
developer term (`href`, `nth-child`, …) is shown to the user. When the auto-pick is wrong,
the user corrects it **by example** (clicking more items/values), and the tool infers the
pattern. Do not add code-shaped inputs to the default builder UI.

## Coding conventions

- **Small, isolated commits**, one logical change each. Commit pre-existing uncommitted work
  separately *before* starting new work.
- **Do NOT add a `Co-Authored-By` / agent trailer** to commit messages.
- **Pure logic must have tests** (the reducer, the selector engine). Components/full flows are
  verified by running the stack (a jsdom Vitest harness exists for future component tests).
- `frontend/package-lock.json` **is committed** — it locks the full transitive dependency
  tree + integrity hashes for reproducible installs (exact pins in `package.json` only cover
  direct deps). `scratch/` and `IMPLEMENTATION_STATUS.md` are gitignored.
- After `next lint` rewrites `frontend/next-env.d.ts` (it has an intentional custom comment),
  restore it: `git checkout -- frontend/next-env.d.ts`.

## Commands

- **Run the stack:** `docker compose up --build` (frontend :3000, API :8000, worker metrics
  :9100, MinIO :9001).
- **Backend tests/lint** (host lacks pytest/ruff — use the container; `--no-deps -v
  "$PWD/backend:/app"` runs against current code without touching a running stack):
  `docker compose run --rm --no-deps -v "$PWD/backend:/app" api pytest -q` ·
  `... ruff check .`. Host `python3` *can* import pure modules like `app.selector_generator`.
- **Frontend** (`cd frontend`): `npm test` (Vitest) · `npm run typecheck` · `npm run lint` ·
  `npm run build`.

## Where things live (quick map)

- **Builder UI:** `frontend/app/page.tsx` (orchestration) drives
  `frontend/app/components/builder-view.tsx`; flow state is a reducer in
  `frontend/lib/builder-reducer.ts`; API client in `frontend/lib/api.ts`.
- **Render → snapshot:** `backend/app/worker.py` + `render_scripts/dom_candidates.js`.
- **Selectors/preview:** `backend/app/selector_generator.py` (snapshot matcher: generate /
  infer / preview_from_snapshot) and `backend/app/recipe_runner.py` (authoritative HTML
  extraction for runs). Endpoints in `backend/app/page_sessions.py`.
- **Full detail:** `docs/reference/builder.md`, `docs/reference/architecture.md`.

## Data flow (reason about "stale/wrong data" here)

Nothing is written to DB/storage while building fields or previewing. Two write moments:
**Render** → screenshot + `page.html` to S3, `domNodes` + candidates to Redis (TTL), a
`PageSession` row to Postgres. **Save sprout** → the sprout to Postgres. Build-time selector
generation/preview read `domNodes` from Redis (the snapshot); the saved **run** re-fetches
live HTML. See `docs/reference/architecture.md`.

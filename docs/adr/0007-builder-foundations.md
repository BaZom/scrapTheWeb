# ADR 0007 — Builder Foundations: authoritative matches, draft persistence, SSE, reducer

- **Status:** Accepted
- **Date:** 2026-06-07
- **Scope:** `backend/app/selector_generator.py`, `backend/app/page_sessions.py`,
  `backend/app/recipes.py`, `frontend/lib/api.ts`, `frontend/lib/builder-reducer.ts`,
  `frontend/app/components/builder-view.tsx`, `frontend/app/page.tsx`, `frontend/vitest.config.ts`
- **Builds on / closes follow-ups from:** ADR 0001 ("What to read next" backlog — all four done).

ADR 0001 shipped the Phase-1 builder UX and ended with four foundational follow-ups
it kept bumping into: (1) a real state machine, (2) SSE run progress, (3) the selector
endpoint returning matched nodeIds, (4) draft persistence. This ADR records the work on
that backlog. Like the other ADRs it captures *why* each decision was made, the
alternatives rejected, and concepts worth reading so the reasoning is learnable.

Each section is shipped as its own small commit so the history reads as a sequence of
isolated, reviewable changes.

---

## Decision 1 — The selector endpoint returns the exact matched node IDs

**What:** `POST /page-sessions/{id}/selector` now returns `matchedNodeIds` alongside
`selector` / `matchCount` / `strategy`. In **container** mode these are the repeated
cards the selector matches; in **node** (relative) mode they are the matched cell in
*every* container (the whole extracted column). The builder outlines those exact nodes.

**Why:** ADR 0001 Decision 4 outlined the matched set with a *client-side heuristic* —
group nodes by `tag + sorted-class signature` and outline the ones matching the clicked
element's signature. That was an honest approximation, but it could over- or under-match
whenever the real selector used `:nth-of-type`, attribute, or structural rules, because
the client only has a flat node list, not a DOM, and deliberately never reimplemented a
CSS engine. The authoritative answer already existed on the server: `_matching_nodes` /
`_matching_descendants` are the same functions that compute `matchCount`. We were
throwing their result away and returning only the count. Returning the IDs makes the
outline and the count come from one source, so they can no longer disagree.

**How it stays cheap:** no new traversal — `generate_selector` already called
`count_matches`, which is `len(_matching_nodes(...))`. We compute the node list once and
return both its length and its IDs.

**Heuristic kept as a narrow fallback:** the synthetic `body` selector used for
single-record pages (ADR 0005) isn't in `domNodes`, so the backend returns no IDs there.
The tag/class signature stays as a fallback for exactly that case; for every real
selector the authoritative IDs win.

**Alternatives rejected:**
- *Ship a client-side CSS selector engine* — rejected in ADR 0001 for the same reason:
  it's a project in itself and still an approximation against a flat node list.
- *A second endpoint to fetch matches* — an extra round-trip for data the selector call
  already computes.

**Concepts to look up:**
- **Single source of truth** — one computation feeding both the badge and the outline;
  why two derivations of "the same" thing drift.
- **Heuristic vs. authoritative data**, and shrinking a heuristic to the narrowest case
  it's still needed for instead of deleting it outright.

---

## Decision 2 — The builder resumes in-progress work after a reload

**What:** the builder snapshots its state to `localStorage`
(`scraptheweb.builder-draft.v1`, debounced 400 ms) whenever a page session exists, and
restores it on mount: URL, recipe name, detected shape, pick mode, the page session
(DOM nodes + candidates), the current selection, and the mapped fields/samples.

**Why:** page sessions are ephemeral. A refresh — or an accidental tab close — discarded
*all* mapping work: the picked item and every field name/selector the user typed. That
is the single most expensive thing to lose, and losing it silently is the worst kind of
data loss.

**The screenshot is the one piece we can't serialize.** It's a blob `object URL`, valid
only for the page that created it. So restore records the `sessionId` and re-fetches the
image from the page session (still alive within its server-side TTL) once an auth token
is available. If the session has expired, the *mapping* is still restored and only the
canvas image is blank — the work survives even when the render doesn't.

**Two ordering hazards, and how they're handled:**
- *The persist effect must not wipe the draft before restore reads it.* On mount the
  persist effect would run with empty initial state and clear the key. We skip its first
  invocation with a ref so restore (which reads the key) always wins.
- *The screenshot re-fetch needs a token that may arrive a tick later.* Auth-session
  restore and draft restore are separate mount effects; the screenshot effect waits on
  both `restoredSessionId` and `session`, then clears `restoredSessionId` so it fires
  exactly once.

**Persist *iff* there is work to resume:** the snapshot is written only when a page
session exists and is otherwise removed. That one rule also covers sign-out and reset
(both null the page session), so there's no separate "clear the draft" call to forget.

**Alternatives rejected:**
- *Persist only the mapping intent (fields + URL), not the page session* — smaller, but
  the derived-step UI (ADR 0001 Decision 2) would show "fields mapped" with an empty
  canvas until a re-render. Persisting the page session keeps the restored state
  self-consistent.
- *Server-side drafts* — the right long-term home, but a schema + endpoints + ownership
  story; `localStorage` resumes the *local* tab's work with zero backend change.

**Concepts to look up:**
- **Local-first / autosave**, and serialization boundaries (what *can't* cross them —
  here, a blob object URL).
- **Effect ordering & idempotence** in React — the skip-first-run ref, and why a single
  "persist iff state exists" rule beats scattered imperative clears.
- **`localStorage` quota** (`setItem` can throw) — degrade silently rather than crash.

---

## Decision 3 — Run progress streams over SSE instead of polling

**What:** `GET /api/runs/{id}/events` streams the run as Server-Sent Events — the full
`RunResponse` on every change — until the run reaches a terminal state. The frontend
opens it once per run as the primary progress path and replaces its run state wholesale
on each frame. If the stream errors or closes while the run is still non-terminal, the
client quietly falls back to the previous `getRun` polling loop.

**Why fetch + ReadableStream, not `EventSource`:** the native `EventSource` API cannot
set request headers, and this API authenticates with Bearer tokens / `X-API-Key` (no
cookies). The alternatives were a token in the query string — which would leak it into
access logs in a codebase that otherwise has a log redactor and SSRF guards — or
consuming the SSE stream with `fetch` + a `ReadableStream` reader, which keeps the normal
`Authorization` header. We chose the latter; it's a few lines of framing code (split on
the blank-line delimiter, reassemble `data:` lines) and keeps auth uniform.

**Why stream the whole `RunResponse`:** intermediate "running" frames are tiny (no
records yet); only the terminal frame carries records/changes. Sending the full object
means the client just replaces its state — no separate "now fetch the details" round
trip — for negligible bandwidth.

**Server-side care:**
- The stream re-reads the run with **short-lived per-poll sessions** and explicitly
  **closes the request-scoped session** up front, so a minutes-long stream doesn't pin a
  connection from the pool.
- It ends on terminal state, on client disconnect (`request.is_disconnected()`), or at a
  300 s cap (bounds an abandoned/stuck job).
- Authorization happens once before streaming (404 if the run isn't in the caller's org);
  per-poll reads re-scope by `organization_id` defensively.

**Effect hygiene on the client:** the effect keys on a derived `activeRunId` (the id only
while the run is non-terminal), so the stream opens once per run rather than reconnecting
on every pushed update, and tears down cleanly when the run finishes. A tiny transport
state inside the effect tracks whether a terminal frame has arrived; if not, stream
failure or early close starts a polling fallback. Cleanup aborts the stream and clears
any fallback timer.

**Alternatives rejected:**
- *Keep polling, just faster* — more requests, still client-driven, and timestamps stay
  client-side guesses.
- *WebSockets* — bidirectional and heavier; run progress is one-way server→client, which
  is exactly what SSE is for.

**Note on real per-event log lines (deliberately not done):** ADR 0001 Decision 7 wanted
real log lines over the wire. The run job is short and atomic (render → extract →
persist), so the client-synthesized log from the run summary already reflects the real
milestones; having the worker publish per-event logs to Redis adds moving parts for
little user value on a sub-minute job. Revisit if runs grow into multi-step crawls.

**Concepts to look up:**
- **Server-Sent Events** framing (`data:` lines, `\n\n` delimiter) and why it fits
  one-way streaming; **SSE vs. WebSockets vs. long-polling**.
- **`EventSource` header limitation** and the `fetch` + `ReadableStream` pattern.
- **Progressive fallback** — use the best transport first, but keep an older, boring
  transport as a reliability safety net across proxies and flaky networks.
- **Connection lifetime** under streaming responses — why you release the request-scoped
  DB session and poll with short-lived ones.
- **Deriving an effect key** (`activeRunId`) to avoid reconnect-per-update churn.

---

## Decision 4 — The builder flow runs on a reducer (state machine)

**What:** the ~18 builder `useState` flags in `page.tsx` are replaced by a single
`useReducer` over `builderReducer` (`lib/builder-reducer.ts`) with named actions
(`render_succeeded`, `container_selecting`, `field_added`, `step_navigated`, …). State is
destructured back to the same names, so reads are unchanged; only writes — now
`dispatch(action)` — change.

**Why:** the transitions were spread across handlers that each had to remember to clear
the right downstream slices. "Going back" (`handleStepNavigate`) and re-picking an item
each cleared ~8 pieces of state by hand — exactly the desync hazard ADR 0001 Decision 2
flagged. A reducer makes every transition atomic and named, so a transition can't
half-update, and the clearing rules live in one place.

**Why now, and not earlier:** when the builder looked settled this was hard to justify as
pure cleanup. The decision flipped once an **assistant** (page analysis + hints) landed on
the roadmap: accepting a suggestion is a *bulk* mutation (item + several fields + shape at
once), which is precisely the multi-setter pattern that desyncs — one `dispatch` makes it
safe. So the reducer is the foundation the assistant will build on, not cleanup for its
own sake.

**De-risked in three steps**, each its own commit: (1) add a Vitest harness — the
frontend had no tests at all; (2) build the reducer as a pure, fully-tested module with no
wiring; (3) swap `page.tsx` over. Because the reducer is a pure function, the builder's
transition logic is now unit-tested (19 cases), including the desync-prone
step-navigation clearing for both list and single flows.

**What stayed out of the reducer:** state with no cross-slice invariant — the screenshot
blob URL (side-effect lifecycle), the derived live field sample, sample-busy, the canvas
view toggle, and all async/error/auth/workspace state. Putting those in the reducer would
add ceremony without removing a desync risk.

**Concepts to look up:**
- **Reducer pattern / finite state machines** — modeling UI as `(state, action) → state`.
- **Pure functions and testability** — why moving logic out of effects/handlers into a
  reducer is what makes it unit-testable.
- **Refactor under a safety net** — harness first, mirror behavior, swap last; and using
  the type checker (removed setters become compile errors) to find every call site.

## Verification
- Backend: `generate_selector` returns `matchedNodeIds` in both modes, verified against
  the real module on a synthetic grid; new cases in `tests/test_selector_generator.py`
  (`...returns_every_matched_node_id`, `...across_containers`).
- Frontend: a Vitest harness now exists (`npm test`). The builder reducer has 19 cases
  covering shape detection, selection/auto-advance, field add, and step-navigation
  clearing. `tsc --noEmit`, `next lint`, and `next build` are clean. Browser behavior
  (reload-resume, live SSE, the builder click-through after the reducer swap) is verified
  by running the stack.

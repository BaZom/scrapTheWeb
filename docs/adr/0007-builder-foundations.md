# ADR 0007 — Builder Foundations: authoritative matches, draft persistence

- **Status:** Accepted / in progress
- **Date:** 2026-06-07
- **Scope:** `backend/app/selector_generator.py`, `backend/app/page_sessions.py`,
  `frontend/lib/api.ts`, `frontend/app/components/builder-view.tsx`,
  `frontend/app/page.tsx`
- **Builds on / closes follow-ups from:** ADR 0001 ("What to read next" backlog).

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

## Still on the backlog (not in this ADR yet)

- **SSE for run progress** — replace the 1.5 s `setInterval` poll with a stream and emit
  real per-event log lines. Note a real constraint: the native `EventSource` API cannot
  send an `Authorization` header, and this app authenticates with Bearer tokens (no
  cookies). So SSE here means either a token in the query string (leaks into logs — bad
  in a codebase with a log redactor and SSRF guards) or consuming the stream via `fetch`
  + `ReadableStream` (keeps the header). The latter is the intended approach; documented
  here so the decision is made deliberately, not by accident.
- **State machine** — replace the ~40 `useState` flags and the large `builderProps` memo
  in `page.tsx` with a reducer. Highest leverage, highest risk (no frontend test harness
  yet), so it wants its own focused change with manual verification.

## Verification
- Backend: `generate_selector` returns `matchedNodeIds` in both modes, verified against
  the real module on a synthetic grid; new cases in `tests/test_selector_generator.py`
  (`...returns_every_matched_node_id`, `...across_containers`).
- Frontend: `tsc --noEmit` and `next lint` clean. Reload-resume is browser behavior and
  is verified by running the stack (no frontend unit harness in the repo).

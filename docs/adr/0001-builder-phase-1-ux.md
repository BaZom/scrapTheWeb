# ADR 0001 — Recipe Builder, Phase 1 UX & technical improvements

- **Status:** Accepted / implemented
- **Date:** 2026-05-31
- **Scope:** `frontend/app/components/builder-view.tsx`, `frontend/app/page.tsx`,
  `frontend/app/components/ui.tsx`, `frontend/lib/api.ts`
- **Deliberately out of scope:** no backend changes. Everything here uses data the
  API already returns. The deeper bets (state machine, SSE, selector editing,
  field transforms) are Phase 2 / Phase 3.

This document records each non-obvious decision, *why* it was made, the
alternatives that were rejected, and — for each — the concepts worth reading up on
so the reasoning is learnable, not just copyable.

---

## How the builder works today (baseline)

The builder is a 5-step flow: **Load URL → Select container → Map fields →
Preview records → Save & run**. A "container" is the repeating element (a product
card, a Hacker News row); "fields" are the values pulled out of each container
(title, price, url). The backend renders the page to a screenshot + a flat list of
DOM nodes (`domNodes`, each with geometry `x/y/width/height`), and the UI paints
clickable overlays on top of the screenshot.

The current step is **derived** from which state exists (`currentStep()` in
`builder-view.tsx`), not stored. That single fact drives several decisions below.

---

## Decision 1 — Auto-advance to "Field" mode after a container is picked

**What:** In `page.tsx` `handleNodeSelect`, once the container's selector resolves
successfully, we flip `pickMode` from `"container"` to `"field"`.

**Why:** The flow has a hidden mode switch. After picking a container the only
sensible next action is to map fields inside it, but previously the user had to
discover the "Container / Field" segmented toggle on their own (the only hint was a
sentence of body text). Auto-advancing removes a step the user shouldn't have to
think about — the UI should encode the happy path.

**Alternatives rejected:**
- *Leave it manual* — keeps the discoverability problem.
- *Remove the toggle entirely and infer mode from whether a container exists* —
  less flexible; users sometimes want to re-pick the container, so the toggle stays
  but defaults intelligently.

**Concepts to look up:**
- **Progressive disclosure** and the idea of a "happy path" / "desire line" in UX.
- **State-driven UI**: the mode is state; the transition is a side effect of
  another state change. (This is exactly the kind of thing a state machine models
  cleanly — see Phase 2.)

---

## Decision 2 — Make the stepper navigable instead of decorative

**What:** `Stepper` in `ui.tsx` gained an optional `onStepClick`. Completed/current
steps render as `<button>`s. `page.tsx` `handleStepNavigate(target)` rewinds the
flow by clearing all state *downstream* of the chosen step.

**Why:** The stepper looked interactive but wasn't. Because the current step is
*derived* from state presence, "going back" is not a stored pointer you decrement —
it's "delete the data that represents later steps and the derived step falls back on
its own." That's why `handleStepNavigate` clears `preview`/`savedRecipe`/`run` etc.
rather than setting a step number.

**Alternatives rejected:**
- *Store an explicit `step` number* — would then have two sources of truth (the
  number and the data), which can desync. Deriving step from data is the cleaner
  invariant; we kept it and made navigation honor it.
- *Confirm dialog before clearing* — deferred; the clears are cheap to redo and a
  modal on every back-click is heavy. Revisit if users lose expensive work.

**Concepts to look up:**
- **Derived state vs. stored state** ("single source of truth"); why duplicated
  state desyncs.
- **Controlled components** in React (the parent owns the value, the child reports
  intent via a callback — `onStepClick`).
- **Accessibility:** `aria-current="step"`, and why an interactive element must be a
  real `<button>` (keyboard focus, Enter/Space activation) and not a clickable
  `<div>`.

---

## Decision 3 — Devtools-style hover inspection (boxes faint until hovered)

**What:** The overlay boxes used to all render with a visible blue fill at once (up
to 220 of them). Now each box is transparent until you hover it; hover paints it +
shows a small tag label. Selected and matched nodes stay visible.

**Why:** 220 simultaneously-filled boxes is visual noise and makes it hard to tell
what you're about to click. Browser devtools solved this years ago: highlight only
the element under the cursor. The boxes still need to *exist* in the DOM to capture
hover/click, so we keep them but make the non-active ones visually empty.

**Alternatives rejected:**
- *Render a single overlay computed from mouse coordinates (hit-testing)* — more
  "correct" devtools behavior, but requires mapping cursor → node by walking
  geometry on every mousemove. Heavier and unnecessary when the buttons already
  give us hover events for free. Noted as a Phase 2 option if perf demands it.
- *Virtualize / canvas-render the overlays* — only worth it if the 220-node cap
  becomes a bottleneck. Premature now.

**Concepts to look up:**
- **Hit testing** and z-ordering of absolutely-positioned elements.
- **Pointer events** (`onMouseEnter`/`onMouseLeave`) vs. tracking `mousemove`.
- **Perceptual load / signal-to-noise** in visual UI.
- The **overlay cap**: container mode still slices to the 220 largest boxes, but field
  mode is uncapped so small details (price, mileage) stay selectable — see ADR 0006 §2.

---

## Decision 4 — Outline the whole matched set (client-side approximation)

**What:** When a container is selected, every sibling that shares its
**tag + sorted-class signature** gets a dashed green outline (`matchedNodeIds` in
`builder-view.tsx`). This visualizes "these are all the cards I'll extract."

**Why:** The backend returns `matchCount` (e.g. "24 matches") but not *which* nodes
match, so the user couldn't see whether the selection actually covered every card —
the single biggest source of "did this work?" doubt. We approximate the matched set
on the client to give that confidence.

**Important honesty caveat (documented intentionally):** This is a *heuristic*. The
authoritative number is still the backend's `matchCount` badge. Our signature match
(tag + classes) usually equals the backend's selector result but can diverge (e.g.
selectors using `nth-child`, attribute, or structural rules). We deliberately did
**not** reimplement a CSS selector engine on the client.

**Proper fix (Phase 2/3):** have the `/selector` endpoint return the matched
`nodeId`s alongside `matchCount`, and highlight exactly those. Then the heuristic
goes away. **Done in ADR 0007 Decision 1** — the heuristic now survives only as a
fallback for the synthetic `body` selector on single-record pages.

**Alternatives rejected:**
- *Ship a client-side CSS selector matcher* — we only have a flat node list with
  tag/classes/attrs, not a real DOM tree, so matching arbitrary selectors correctly
  is a project in itself and would still be an approximation.
- *Don't highlight at all* — leaves the confidence gap that motivated this.

**Concepts to look up:**
- **CSS selectors & specificity**; why "matches this selector" is non-trivial
  without a DOM.
- **Heuristic vs. authoritative data** — and the discipline of labeling which is
  which in the UI (the count stays backend-truth; the outline is a hint).
- **Structural selectors** (`:nth-of-type`, `:nth-child`) and why class signatures
  alone can miss/over-match.

---

## Decision 5 — Live per-field sample value (debounced, cancellable)

**What:** While mapping a field, `page.tsx` runs a **debounced** (350 ms)
single-field preview against the current container and shows the extracted sample
on the field card (`fieldSample`). On "Add field" the sample is captured into
`fieldSamples[name]` so saved field cards keep showing a value.

**Why:** Previously you mapped a field blind and only learned if the selector was
right after clicking "Preview records" and reading the bottom table — a context
switch and a delay. Showing `title → "Show HN: …"` immediately turns "click and
hope" into "click and confirm."

**Why debounced + cancellable:** Rapid clicks and extract-type toggles would each
fire a request. The debounce collapses bursts into one call; the effect's cleanup
sets a `cancelled` flag so a slow/stale response can never overwrite a newer one
(the classic React async-effect race). See the `useEffect` in `page.tsx`.

**Alternatives rejected:**
- *Compute the sample on the client from the screenshot's node text* — node text is
  truncated and doesn't cover `href`/`src`/`attribute` extraction; the server is the
  source of truth for extraction.
- *No debounce* — wasteful request storm and worse race exposure.
- *Add a dedicated single-field endpoint* — would be cleaner, but Phase 1 is "no
  backend"; we reuse the existing preview endpoint with a one-field payload.

**Concepts to look up:**
- **Debouncing vs. throttling.**
- **Race conditions in `useEffect`** and the **cleanup function / cancellation
  flag** pattern (and why `AbortController` is the next step up).
- **Stale closures** in React effects (why the dependency array matters here).

---

## Decision 6 — Render the real before→after diff in the Changes tab

**What:** `ChangeRow` in `builder-view.tsx` now renders `oldData`/`newData` (already
present in `changeEventSchema`): "changed" rows show only the fields that differ as
~~old~~ → new; "new"/"removed" rows show a short snapshot. Added the
`ChangeEvent` type export in `lib/api.ts`.

**Why:** The data was already arriving from the API and being thrown away — the tab
only showed `recordKey`. Showing the actual field-level diff is the entire point of
a change-tracking feature. Highest value-to-effort item in Phase 1.

**Alternatives rejected:**
- *Show every field for changed rows* — noisy; diffing to only-changed fields is
  what makes a diff useful.
- *Character-level/word-level diff* — overkill for short field values; field-level
  old→new is the right granularity here.

**Concepts to look up:**
- **Diffing granularity** (record vs. field vs. character level).
- **Defensive rendering** of `unknown`/nullable API data (`formatValue`, optional
  chaining) — `oldData`/`newData` are `Record<string, unknown> | null`.
- **Schema-derived types** (Zod `z.infer`) — one schema, types stay in sync.

---

## Decision 7 — Stop fabricating log timestamps; remove the duplicate Preview button

**What:** (a) `LogLine` took a `new Date()` at render, so timestamps changed on
every re-render and were never the real event time. It now takes an `at` prop fed
from the run's real `startedAt`/`finishedAt`, falling back to "—". (b) Removed the
header "Preview" ghost button that duplicated the sidebar's "Preview records" and
was confusingly disabled until a preview already existed.

**Why:** Fake timestamps are worse than none — they look authoritative and lie, and
re-rendering made them jump. Truthful "—" until real data exists is honest. The
duplicate button was two controls for one action with contradictory enable logic.

**Note for Phase 2:** the logs are still *synthesized client-side* from the run
summary. Real per-event log lines should come over SSE from the backend; this
change just stops the timestamps from being fabricated in the meantime.

**Concepts to look up:**
- **Render purity / referential transparency** — why side-effecting, non-deterministic
  values (`Date.now()`, `Math.random()`) in render are a bug.
- **Single responsibility for controls** — one action, one affordance.
- **Honest empty/unknown states** over plausible-looking fake data.

---

## What to read next (Phase 2 pointers)

These Phase 1 changes repeatedly bumped into the same structural limits. The
foundational follow-ups, in order of leverage:

1. **State machine (`useReducer`/XState)** — replaces the ~28 `useState` flags and
   the ~40-prop `builderProps` memo in `page.tsx`. Look up *finite state machines*,
   *reducer pattern*, *prop drilling vs. context*. *(Backlog — see ADR 0007.)*
2. **SSE for run progress** — replaces the 1.5 s `setInterval` poll and enables real
   log lines. Look up *Server-Sent Events*, *EventSource*, *long-polling vs.
   streaming*. *(Backlog — see ADR 0007, incl. the EventSource-auth constraint.)*
3. **Selector endpoint returns matched nodeIds** — retires the Decision 4 heuristic.
   *(Done — ADR 0007 Decision 1.)*
4. **Draft persistence** — sessions are ephemeral; a refresh loses mapping work.
   Look up *optimistic UI* and *local-first / autosave* patterns.
   *(Done — ADR 0007 Decision 2.)*

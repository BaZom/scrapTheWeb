# ADR 0002 - Builder Playwright Overlay Reduction

- **Status:** Accepted / implemented
- **Date:** 2026-05-31
- **Scope:** `backend/app/overlay_reduction.py`, `backend/app/worker.py`,
  `backend/app/page_sessions.py`, `frontend/app/page.tsx`,
  `frontend/app/components/builder-view.tsx`, `frontend/lib/api.ts`

## Context

Listing pages often show cookie banners, login prompts, newsletter modals, and
other fixed overlays. In the builder, these overlays are especially painful
because they can cover the listing cards and become the largest selectable DOM
boxes. That makes the user select the overlay container instead of the real
listing container.

We tried a manual Setup mode that let the user select an overlay control and ask
Playwright to click it. Manual testing showed the UX was too heavy and brittle:
after accepting cookies, some sites showed login prompts, selection still drifted,
and reload recovery was confusing.

## Decision

Use a backend-only Playwright overlay-reduction pass before screenshot capture.
After navigation, the worker tries common low-risk actions across the page and
its frames:

- reject optional cookies
- choose necessary/essential-only options
- close, dismiss, skip, "not now", or "no thanks" prompts
- press `Escape` when a modal dialog remains

The builder still displays a frozen screenshot plus app-owned DOM overlays. It
does not embed the live website, store cookie state, or ask the user to perform
manual setup steps. When Playwright dismisses something, the page session returns
`overlayDismissals` metadata so the UI can show a small "Popup dismissed" badge.

## Why This Instead Of Setup Mode

Setup mode made the user solve an implementation detail. It added another picker
state, another backend endpoint, recipe config that had to be replayed, and a
slow re-render loop after every click. It also encouraged users to click "accept"
just to continue, which can change the page state and trigger secondary prompts.

The clean path is to make the common case disappear automatically while keeping
the builder workflow focused on extraction: load URL, select container, map
fields, preview, save.

## Why This Instead Of A Live Embedded Website

A live website inside the builder sounds natural, but it is a bigger product and
security decision:

- many sites block iframes with CSP or frame headers
- target-page clicks compete with builder selection clicks
- navigation, popups, and login flows become part of the app UX
- performance is worse than one Playwright render plus a static screenshot
- isolation and SSRF/security boundaries get more complex

For selector mapping, a frozen snapshot is the better default because screenshot,
HTML, and DOM geometry all come from the same moment.

## Why This Instead Of Cookie Storage

Storing Playwright `storage_state` can hide banners on repeat visits, but it also
creates hidden state. The same URL can render differently depending on previous
clicks, and users have no clear way to understand or reset that state. It also
pushes the product toward making legal consent choices on the user's behalf.

This implementation deliberately avoids cookie persistence. Each render starts
clean and applies the same visible, bounded heuristics.

## Playwright Concepts To Learn

- **Locator handlers:** `page.add_locator_handler` can react to unexpected
  overlays around Playwright actions. It is useful, but it only runs when
  Playwright performs an action or web-first assertion, so we also scan
  explicitly after navigation.
- **Role/text locators:** `get_by_role`, `get_by_text`, `get_by_label`, and
  `get_by_title` use user-facing semantics and are more resilient than raw CSS
  for buttons with translated labels.
- **Frames:** consent managers often live in iframes. The reducer scans
  `page.frames` so frame-hosted buttons can still be clicked.
- **Actionability:** `locator.click()` waits for visibility, enabled state, and
  stable geometry. Short timeouts keep a missing popup from slowing every render.
- **Heuristics:** this is intentionally best-effort. It handles common blockers
  without pretending every site's consent UX can be bypassed safely.

## Consequences

- The builder has fewer modes and a simpler mental model.
- Render jobs spend a little extra time, bounded by short click timeouts and
  three reduction passes.
- Recipe previews and runs use the same render path, so overlay reduction applies
  consistently without versioned setup actions.
- Sites that only expose "accept all" or custom shadow-DOM consent flows may
  still show a banner. That is a known limit, not a reason to add hidden cookie
  state back immediately.

## Future Options

- Add site-specific reducers for high-value domains when generic heuristics are
  not enough.
- Return richer matched-node IDs from selector generation so repeated-listing
  highlighting is exact instead of approximated client-side.
- Consider an explicit advanced browser-control flow only if customers need
  authenticated or highly interactive setup, and keep it separate from the simple
  builder path.

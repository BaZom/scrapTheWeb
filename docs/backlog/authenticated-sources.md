# Authenticated sources — collecting data behind a user's own login

## Summary

Some target sources (a dealer's own mobile.de account, an agent's saved searches on
ImmobilienScout24) sit behind login, CAPTCHAs, and anti-bot systems (Cloudflare, DataDome,
Akamai). Skrowt's constraints are fixed:

- Never bypass CAPTCHAs programmatically.
- Never use proxy rotation to hide identity.
- Never store user passwords.
- The user authenticates with their own legitimate account.
- Session material stays on the user's machine.

This item records the validated strategy (2026-06): a three-step ladder, cheapest and most
legitimate first. Each step reuses the existing sprout config + selector/DOM extraction
engine (`backend/app/selector_generator.py`, `recipe_runner.py`,
`render_scripts/dom_candidates.js`) — only *where rendering happens* changes.

> **Refined in ADR 0012** (the *why* + the full rejected-alternatives list). The concrete v1
> build is `browser-extension.md`; the external site map is
> `docs/reference/target-site-landscape.md`. Tier 1 (server-side on friendly sites) is already
> covered, so this item now tracks **Tier 2 (browser extension)** and **Tier 3 (desktop agent)**.
> Additional rejected ideas recorded in ADR 0012: **residential proxies**, **proxy cookie
> injection (reverse-proxy login)**, and **email-alert forwarding + parsing** (off-concept).

## The ladder

### 1. API Connections (first — already planned)

For platforms with official APIs (mobile.de and ImmobilienScout24 both offer dealer/agent
APIs), an API key is more reliable, ToS-clean, and cheaper than any browser automation.
Covered by [api-connections.md](api-connections.md); that item is the prerequisite and the
preferred answer whenever an official API exists.

### 2. Browser extension with in-page extraction (v1 for non-API sites)

A Skrowt extension runs the field mapping *inside the user's real, logged-in browser tab*
and ships only structured rows to the cloud.

- No cookie exfiltration at all — extraction happens where the session already lives.
- Best possible anti-bot posture: it IS the user's browser, profile, and IP.
- Chrome Web Store distribution; no installer, no code-signing, no Electron to maintain.
- Reuses the sprout's selector config; the extension embeds the same extraction logic.
- Limitation: scheduled refresh requires the browser to be open (MV3 service worker +
  background tabs mitigate, not eliminate).

### 3. Desktop agent (later — unattended scheduling for power users)

A tray/menubar companion app (Electron or Tauri + Playwright) for users who need scheduled
refresh without keeping a browser open.

Hard requirements learned from validation:

- **Persistent browser profile, never cookie transplant.** The user logs in once in a real,
  visible window using a dedicated persistent profile (`user-data-dir`); scheduled runs
  reuse that same profile (headed-minimized or `headless=new`). Copying cookies into a
  fresh context trips fingerprint-bound session checks and gets sessions invalidated.
- **DOM/selector extraction, not vision.** Run the same extraction engine locally; rows-only
  upload. Vision (screenshot + model) is allowed only as a selector-drift repair fallback.
- **Session expiry handling:** detect the login redirect → pause the monitor (don't fail) →
  tray + email notification → one-click reconnect reopening the visible login window.
  Portal "remember me" sessions typically last 30–90 days with sliding expiration, so
  scheduled visits usually keep them alive.
- **Machine availability is the main reliability risk** (laptop asleep = missed run): build
  missed-run tolerance, catch-up runs, and honest "last refreshed" UI.
- **Distribution is a permanent tax:** Apple notarization, Windows code signing, auto-update,
  AV false positives. Budget it before committing.

## Rejected alternatives (don't revisit without new facts)

- **Server-side browser streaming** — per-login Chrome + streaming cost, puts *server* IPs in
  front of anti-bot, and the session stops looking like the user. Worse on every axis.
- **Cookie-transfer extension** — session cookies leave the user's machine; superseded by the
  in-page extraction variant above.
- **DevTools cookie copy-paste** — non-starter UX for non-coders.
- **Login proxy** — server sees credentials/cookies in transit; breaks JS-heavy logins.

## Trust requirement (non-negotiable)

Even with the user's own account, automated access usually violates the platform's ToS, and
any suspension risk lands on the **user's** account. The connect flow must disclose this in
plain language before the first authenticated source is added.

## Cost notes

- Extension/agent: near-zero server render cost (compute is the user's); cloud ingests rows only.
- Vision, if ever used as fallback: ~100 detail pages/week ≈ $2–8/month per workload vs ~$0
  for selectors — acceptable only because the fallback fires rarely.

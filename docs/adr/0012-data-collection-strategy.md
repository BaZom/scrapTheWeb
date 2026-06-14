# ADR 0012 — Data-collection strategy: where extraction runs, and what we rejected

- **Status:** Accepted
- **Date:** 2026-06-13
- **Scope:** Product/architecture direction for *data sources* — how Skrowt collects from
  open vs. protected (anti-bot / login-gated) sites. No code in this ADR; it sets the
  direction for `docs/backlog/browser-extension.md`, `docs/backlog/authenticated-sources.md`,
  `docs/backlog/api-connections.md`, and the site map in
  `docs/reference/target-site-landscape.md`.
- **Builds on:** ADR 0004 (render anti-bot baseline); the existing sprout/selector/diff engine
  (`selector_generator.py`, `recipe_runner.py`, `render_scripts/dom_candidates.js`).

## Context

Skrowt's near-term market is German vehicle listings (cars, leasing, campers, classifieds) and
similar listing sites. These range from **open/light** sites to **fortress** sites
(mobile.de, AutoScout24, Kleinanzeigen) protected by DataDome/Akamai and/or login walls.

Fixed constraints (Skrowt's identity and ethics — not up for trade):

- No CAPTCHA bypass; no proxy rotation / identity hiding; no password storage.
- The user authenticates with their **own** legitimate account; session material stays on the
  user's machine.
- Must stay defensible under EU/German law — **database rights** + **GDPR** apply to taking
  *other people's* compiled/personal data, regardless of it being "public."
- The product must stay **visual, click-to-pick, no-code, any-site**, with scheduled
  monitoring + diff/alerts.

Two findings drove the decision:

**1. The two-origin principle.** To read a protected site you need a request that looks like a
real human's browser — right **IP**, **fingerprint**, and **behavior**. That request can only
originate from **(A) the user's own device**, or **(C) the site itself cooperating** (official
API / feed). Any *server-side* origin **(B)** is a datacenter IP — exactly the signal anti-bot
blocks. **No cookie-shuffling changes where the request originates**, so protected sites cannot
be served server-side without evasion.

**2. Manual vs. scheduled feasibility differ per site.** A single human-paced page load
(building a sprout, or an on-demand "collect now") usually passes *even fortress* anti-bot —
it looks like a real visitor. **Sustained, repeated, scheduled** automated requests are what
get blocked. So "build/collect once" and "monitor on a schedule" must be rated separately per
site (see the landscape reference).

## Decision

**Collect by tier, defined by *where the request runs*:**

1. **Tier 1 — friendly sites** (light / no real bot management): **server-side**, using the
   existing worker. Already covered/shipped. This is the first go-to-market surface.
2. **Tier 2 — fortress + login-gated sites:** run in the **user's own browser via a browser
   extension** that executes the *existing visual sprout* (capture-for-build + run-extraction).
   This is **"Skrowt relocated,"** not a new product — same builder, sprout, diff, records,
   alerts; only the execution location moves to where the user is already logged in. Concrete
   spec: `docs/backlog/browser-extension.md`.
3. **Tier 3 — desktop agent (later):** for unattended scheduling on fortress sites without
   keeping a browser open. Persistent browser profile, never cookie transplant
   (`docs/backlog/authenticated-sources.md`).

**Cross-cutting:**

- **Prefer an official API/feed where one exists** (`api-connections.md`). For the giants, only
  *publish-only / own-stock* dealer APIs exist — **there is no read API for competitor data at
  any price**; that moat is deliberate. Genuine market data is licensable only from aggregators
  (e.g., AutoUncle valuations) — see the landscape reference.
- **Item-facts-only extraction** (price, model, mileage, location, link, image) — **never
  seller PII** — to keep GDPR exposure low.
- **ToS disclosure** before a user adds the first authenticated source (suspension risk lands
  on the *user's* account).

## Rejected alternatives (do not revisit without new facts)

- **Residential proxy rotation** — violates the no-identity-hiding constraint; doesn't even
  defeat behavioral/TLS-fingerprint detection on its own; expensive per-GB; proxy supply chains
  are frequently non-consenting/compromised; legally an *aggravating* factor; and it erodes the
  trust positioning that differentiates Skrowt from commodity scrapers.
- **Proxy cookie injection (reverse-proxy login capture)** — the most broken *and* most
  dangerous option: OAuth/Origin pinning breaks the login outright; the **datacenter IP is
  exposed at the login step** (the most-scrutinized moment); a captured cookie won't replay
  (sessions are fingerprint/IP-bound); and it is architecturally an **AiTM phishing kit**
  (Evilginx/Modlishka pattern) → Safe Browsing/SmartScreen blacklisting of the domain +
  interception of user passwords in transit (catastrophic GDPR/liability).
- **Server-side browser streaming** — puts server IPs in front of anti-bot; the session stops
  looking like the user; per-login Chrome + streaming cost.
- **Cookie transfer / cookie transplant** — session material leaves the machine; fingerprint-
  bound sessions invalidate on replay from a different client.
- **Email-alert forwarding + server-side parsing** — *technically* legitimate and server-side
  (the platform pushes new-match emails to its own user; we parse them). **Rejected as
  off-concept:** it abandons Skrowt's identity — no visual builder, a **per-platform parser
  built by us** (not the user) so it doesn't generalize, it breaks the "any site, no-code"
  promise, and it's parsing-brittle. A different product, not a Skrowt feature.
- **DevTools cookie copy-paste** — non-starter UX for non-coders. **Login proxy** — server sees
  credentials/cookies in transit; breaks JS-heavy logins.

## Consequences

- Fortress sites get **manual / on-demand collection now** (works today, especially via the
  user's browser); **unattended monitoring only after the extension (Tier 2) ships.**
- **Build priority becomes the browser extension** — it's the only path that reaches fortress
  sites while staying true to the product.
- The external **target-site map is maintained in `docs/reference/target-site-landscape.md`**
  (ratings shift as anti-bot evolves; verify with a live probe before committing engineering to
  a given site).

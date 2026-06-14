# Product strategy — what Skrowt is, the business logic, and the roadmap (source of truth)

> **Read this first to understand the *business + plan*.** For the *technical* truth see
> `architecture.md` (system, pipeline, data model) and `builder.md` (the build workflow); for
> the market see `target-site-landscape.md`. The *why* behind this strategy is **ADR 0013**
> (refining ADR 0012). This file is current-truth and gets updated as the plan moves; it is the
> single place the plan lives — no roadmap duplicated elsewhere.

---

## ▶ Current focus / next action (start here each session)

- **Now:** Phase 0 — make the **core monitoring loop excellent on public listings** and prove a
  real user comes back because a diff *mattered*. The make-or-break sub-item is **selector-drift
  recovery** (a sprout that silently breaks turns alerts into lies — that's a precondition, not
  polish).
- **Not now (deferred until explicit pull):** browser extension, private/desktop agent.
- **Parked (needs a deal, not a build):** API resell.
- **Dead (do not revisit):** residential proxies, raw API resell, general-monitor launch
  positioning, bulk harvesting. (See *Dead options* below and ADR 0013.)

---

## 1. What Skrowt is, and who it's for

Skrowt is a **structured web-monitoring product for non-coders**: you visually pick the
repeating items and fields on a public listing/detail page (no code, no selectors typed), and
Skrowt watches that page on a schedule and tells you **what changed** — new / changed / removed
items — then alerts and exports.

- **The differentiator is structured *item*-diff, not page-diff.** Commodity monitors
  (Visualping, Distill, changedetection.io) say "this region changed." Skrowt says "3 new
  listings, 1 price drop, 1 removed — here are the rows." That only delivers value when the tool
  understands a domain's notion of an *item* and a *meaningful field* — which is why Skrowt goes
  to market through one niche, not as a general monitor.
- **Lead customer:** business/dealer in the **camper/vehicle** space (budget lives there; BYOK
  implies someone who already holds API keys). The non-coder visual builder is the on-ramp;
  the recurring meaningful alert is what retains.
- **Ethics are fixed identity, not trade-offs** (ADR 0012): no CAPTCHA bypass, no proxy/identity
  hiding, no password storage; the user authenticates with their *own* account; **item facts
  only, never seller PII**; EU/GDPR-defensible throughout.

## 2. The architecture spine — one engine, four pluggable sources

The **product is the engine**; data sources are interchangeable and tagged by `source_type`.
Everything downstream is shared and reused unchanged:

```
[ source ] → records → DIFF (new/changed/removed) → alerts → exports
   server | api | browser | agent              └─ the engine (reused unchanged) ─┘
```

| `source_type` | What it is | Risk / role | Status |
|---|---|---|---|
| `server` | Server-side render + extract on friendly/public sites (the existing worker) | The workhorse; works where a site has no real bot management | **Shipped** |
| `api` | **BYOK API connections** — customer brings their own keys; we wire them in | Zero anti-bot/legal risk (sanctioned data); premium B2B add-on | Planned (`api-connections.md`) |
| `browser` | Browser extension — runs the sprout in the user's own logged-in browser | Reaches fortress/login sites without evasion (real IP/session) | **Deferred** (`browser-extension.md`) |
| `agent` | Private/desktop agent — persistent real profile, unattended | Watchlist-scoped, polite, **no proxies**; furthest out | **Deferred** (`authenticated-sources.md` Tier 3) |

`browser`, `agent`, and `api` all feed the **same** records/diff/alert/export pipeline — only
*where the data comes in* differs. (Technical detail: `architecture.md`, `builder.md`.)

## 3. The core workflow (what the user actually does)

1. **Build** — open a public listing page, click the repeating item + the fields you want. No
   code; corrections are by example. (`builder.md`)
2. **Save** — the sprout (selectors + schedule) is stored.
3. **Monitor** — on schedule, the chosen source re-collects the live rows.
4. **Diff** — the engine computes new / changed / removed against the last run.
5. **Alert / export** — meaningful changes notify the user and/or export.

**Feasibility = legality (the same envelope).** Monitoring is **watchlist-scoped** — a few
hundred polite, jittered requests/day reading item-dense *list* pages, not thousands of
detail-page loads. Size each site by **measuring its block ceiling and promising under it**
(the landscape's ⏱️ ratings encode this: e.g. Kleinanzeigen = 🟡 low-freq). This bounded volume
is both what a single real browser/IP can survive *and* what stays inside the EU
database-right / ToS / GDPR envelope. Bulk harvesting fails both at once.

## 4. The moats (stacked — hard to copy together)

1. **Structured item-diff** — incumbents do page-diff.
2. **EU/GDPR-native + German localization** — a trust/compliance moat global incumbents can't
   cheaply match; data residency matters in DACH. Turns the ethics constraints into selling points.
3. **Vehicle/camper domain edge** — the niche is wide-open, low-competition, no fortress
   anti-bot, and has no read APIs anywhere (`target-site-landscape.md`).

Any one alone is beatable; all three at once is not rebuildable overnight.

## 5. The roadmap (strict, gated) — and the future goal

**Future goal:** the EU/GDPR-native **structured monitoring product**, won decisively in the
camper/vehicle niche, then widened outward — one engine, multiple *sanctioned* sources. General
coverage is the destination reached *by winning a niche first*, never the launch.

Phases are **gated**: do not start the next phase until the gate is met.

| Phase | Build | Exit gate (must be true to advance) |
|---|---|---|
| **0 — Core loop (now)** | Excellent build → monitor → **diff** → alert → export on public listings, **incl. selector-drift recovery** | **One real user monitors a real search they care about and acts on a meaningful alert.** |
| **1 — Source + GTM** | `api` BYOK connections; niche go-to-market (camper/vehicle); *parallel:* cheap **fortress-feasibility spike** | Paying/active users on the niche; the spike has measured whether the per-browser model survives on a target fortress site |
| **2 — Extension (pull-gated)** | `browser` extension for fortress/login sites | **Users explicitly ask** for unattended/fortress monitoring **and** the Phase-1 spike proved the thesis survives |
| **3 — Agent (furthest out)** | `agent` desktop app, watchlist-scoped, no proxies | Real, repeated demand for **unattended** fortress monitoring that the extension (browser-open-only) can't serve |

## 6. Dead options (settled — see ADR 0013; do not re-litigate)

- **Residential proxies anywhere, incl. the agent** — destroys the agent's only defence,
  recreates a rejected alternative, adds tool-maker liability at scale.
- **Raw API resell** — legal (resale forbidden) + thin-margin + no moat. Only viable as
  *licensed data through our workflow*, via a negotiated deal, later — not a build feature.
- **General-monitor launch positioning** — commoditised; niche is the door to the general market.
- **Bulk harvesting** (thousands of detail loads/day) — not survivable politely, risks the
  user's account, legally exposed. Promise watchlist monitoring, not catalogue scraping.

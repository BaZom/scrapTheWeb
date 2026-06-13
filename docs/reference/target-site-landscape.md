# Target-site landscape — German vehicle listings (external, maintained)

A current map of the sites Skrowt aims to collect from, and **how** each can be collected. This
is *external market intelligence*, kept here as a maintained reference (history-free). The
**why/decisions** behind the tiers live in **ADR 0012**; the extension build is
`docs/backlog/browser-extension.md`.

> ⚠️ **Freshness:** anti-bot setups and ownership change. Vendor labels for smaller sites are
> *inferred from CDN/WAF evidence*, not confirmed. **Verify with a live probe before committing
> engineering to a site.** Last compiled: **2026-06**.

## How to read this

Each site is rated on **two independent capabilities** (the manual-vs-scheduled finding, ADR 0012):

- 🛠️ **Manual** — build a sprout / on-demand "collect now" (one page, real browser, human pace).
- ⏱️ **Scheduled** — recurring monitoring (assuming the **per-user-browser** model at polite
  cadence; server-side scheduling is worse on 🟡/🔴).

🟢 reliable · 🟡 fragile / low-frequency / needs care · 🔴 don't rely on it.

**Legal note:** ToS prohibits scraping on essentially all of these — colors are *technical /
enforcement* reality, **not** legal permission. Mitigations apply throughout: per-user browser
where needed, polite cadence, **item-facts-only (never seller PII)**.

**The deployment principle (ADR 0012):** server-side from a datacenter IP only works where a
site runs *no real bot management*. Cloudflare-tier or harder ⇒ move that site into the user's
own browser (extension). Fortress (DataDome/Akamai) ⇒ manual/on-demand only, no unattended
scheduling.

## A. Car giants — fortress anti-bot
| Site | Owner | Anti-bot | 🛠️ | ⏱️ | API & cost |
|---|---|---|---|---|---|
| **mobile.de** | Adevinta/Permira | DataDome-class | 🟢 | 🔴 server · 🟡 browser low-freq | Seller API **publish-only**, bundled in dealer fees. **No read API.** |
| **AutoScout24** | Hellman & Friedman | **Akamai** (confirmed) | 🟢 | 🔴 server · 🟡 browser low-freq | Listing-Creation API **publish-only**, dealer-gated. No read API. |
| **Kleinanzeigen.de** | Adevinta | **DataDome + Akamai** (confirmed) | 🟢 | 🟡 browser, low-freq | No public API. The **proven wedge** (cars); most-defended "yellow". |

## B. Smaller car portals / retail
| Site | Owner | Anti-bot | 🛠️ | ⏱️ | API & cost |
|---|---|---|---|---|---|
| **gebrauchtwagen.de** | Autoplenum GmbH | light | 🟢 | 🟢 | None (re-lists giants → good breadth) |
| **pkw.de** | independent | light | 🟢 | 🟢 | None |
| **car.de / auto.de** | auto.de Media | light | 🟢 | 🟡 | None |
| **autohero.com** | AUTO1 | Cloudflare-class (unconfirmed) | 🟢 | 🟡 | No public API (own stock) |
| **autoplenum.de** | Autoplenum GmbH | light | 🟢 | 🟢 | None (reviews, not listings) |
| **AUTO1.com** | AUTO1 | login-walled B2B | 🔴 | 🔴 | Partner/remarketing only, gated |
| ~~heycar.de~~ | VWFS | — | ☠️ | ☠️ | **Defunct ~May 2025** |
| **wirkaufendeinauto.de** | AUTO1 | — | — | — | Buying funnel — no listings to monitor |

## C. Leasing & subscription (auto-abo)
| Site | Owner | Anti-bot | 🛠️ | ⏱️ | API & cost |
|---|---|---|---|---|---|
| **leasingmarkt.de** | AutoScout24 | AWS CloudFront (CDN only) | 🟢 | 🟢→🟡 | No public API |
| **leasingtime.de** | AutoScout24 | CloudFront | 🟢 | 🟢→🟡 | No public API |
| **vehiculum.de** | independent | Cloudflare, moderate | 🟢 | 🟡 | No public API |
| **allane.de** (ex–Sixt Neuwagen) | Hyundai Capital | Cloudflare (`__cf_bm`) | 🟢 | 🟡 | B2B partner API (lease-return inventory), gated |
| **carwow.de** | Carwow (UK) | Cloudflare (mixed) | 🟢 | 🟡 | No public API |
| **meinauto.de** | Renault/Mobilize | Google Cloud edge | 🟢 | 🟡 | No public API (uses BetterBe internally) |
| **FINN** (finn.com) | FINN | Netlify edge, light | 🟢 | 🟡 | **Documented Partner API** (car data + subs), partner-gated, no public price |
| **mivodo.com** | Mivodo | Cloudflare | 🟢 | 🟡 | None — *aggregator, doubly ToS-exposed; prefer sources* |
| **ViveLaCar** | The Platform Group | WAF undetermined | 🟢 | 🟡 | No public API |
| **faaren** | FAAREN Group | Cloudflare | 🟢 | 🟡 | White-label SaaS (product *is* the integration), contact-sales |
| ~~like2drive~~ / ~~cluno~~ | — | — | — | — | **Paused / defunct** |

## D. Camper / RV — sales
| Site | Owner | Anti-bot | 🛠️ | ⏱️ | API & cost |
|---|---|---|---|---|---|
| **caraworld.de** | Motor Presse Stuttgart | undetermined (powers ADAC Wohnmobilmarkt) | 🟢 | 🟡 | None (dealer feed onboarding) |
| **classic-trader.com** | Classic Trader GmbH | undetermined, light/mod | 🟢 | 🟡 | None |

## E. Camper / RV — sharing & rental (roadsurfer-adjacent)
| Site | Owner | Type | 🛠️ | ⏱️ | API & cost |
|---|---|---|---|---|---|
| **PaulCamper** | merged w/ Yescapa (2022) | P2P sharing | 🟢 | 🟡 | Affiliate program only — no data API |
| **Yescapa** | Yescapa Group | P2P sharing | 🟢 | 🟡 | No data API |
| **Indie Campers** | Indie Campers (PT) | Hybrid (own fleet + P2P) | 🟢 | 🟡 | No public API |
| **McRent** | Erwin Hymer / Thor | Station fleet rental (not P2P) | 🟢 | 🟡 | No public API |
| **roadsurfer Spots** | roadsurfer | Camping-**pitch** sharing | 🟢 | 🟡 | No public API (internal only) |

*(roadsurfer itself = campervan rental + camper-abo + Spots + used-fleet sales; internal
PHP/Symfony APIs only, nothing public. Anti-bot for this group undetermined, likely Cloudflare-class.)*

## F. Commercial / motorcycle / general classifieds
| Site | Owner | Anti-bot | 🛠️ | ⏱️ | API & cost |
|---|---|---|---|---|---|
| **truckscout24.de** | Machineseeker Group | assume meaningful (peer Akamai), unconfirmed | 🟢 | 🟡 | Seller upload API **write-only**, gated |
| **1000ps.de** | Motorpresse Intl (AT) | undetermined | 🟢 | 🟡 | Dealer ingest CMS, no public read API |
| **quoka.de** | Russmedia (AT) | undetermined, light | 🟢 | 🟢 | No official API (3rd-party tools only) |
| **markt.de** | markt.de | undetermined, light (geo-DE) | 🟢 | 🟢 (from DE) | No official API |
| **webmobil24 / ROMOTO** | Ico-International | light | 🟢 | 🟢 | **Public REST API — query dealer inventory** (the only browse API), B2B contact-sales |
| ~~kalaydo.de~~ | Markt Group | — | — | — | **Vehicle marketplace killed 2021** (job board now) |

## G. Aggregators (the only real data APIs)
| Site | Owner | 🛠️ | ⏱️ | API & cost |
|---|---|---|---|---|
| **AutoUncle** | AutoUncle (DK) | 🟢 | 🟡 | **B2B valuation + live-comparables API** — the one genuine market-data API; enterprise contact-sales |
| **ooyyo.com** | OOYYO | 🟢 | 🟡 | "API" is **inbound free feed registration**, not outbound data |

## What this means for Skrowt
- **No official read API exists for competitor data** anywhere in the market — the moat is
  intentional. Scraping via the per-user-browser model is the only route; licensed valuations
  (AutoUncle) are the alternative when a customer needs market data, not raw listings.
- **Addressable market = sections B–F** (leasing, classifieds, camper, smaller portals):
  Cloudflare-tier or lighter ⇒ realistic 🟢/🟡 scheduled. Plus 🛠️ on-demand works *everywhere*.
- **Giants (A) stay manual-only** until the extension ships; then 🟡 low-frequency via the
  user's browser.
- **Camper/abo (C–E)** is a wide-open, low-competition niche adjacent to roadsurfer's domain —
  no fortress anti-bot and no read APIs anywhere.

Sources captured during research (2026-06): mobile.de Seller API; AutoScout24 Listing-Creation
API; Scrapfly (AutoScout24/Akamai); DataDome classifieds case study; AutoScout24 acquires
LeasingMarkt; FINN developer portal; AutoUncle B2B API; WebMobil24/ROMOTO API; Motor Presse
(caraworld); roadsurfer company profile.

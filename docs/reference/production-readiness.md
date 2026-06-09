# Production readiness — current limitations & improvements

What the app does **not** yet do, and the concrete work to do before/at production scale.
Grouped by area; not in strict priority order. (Decision history for shipped items is in
`docs/adr/`.)

## Builder UX & recipe quality
- **Server-side recipe drafts.** Drafts are `localStorage` only (per-tab, per-device). A
  server draft (schema + endpoints) would survive device switches and team handoff.
- **Field transforms.** Post-process extracted values with no-code presets (trim, "numbers
  only", strip currency, first line, date parse). Touches `recipe_runner.py` + a per-field UI.
- **Exclude / negative examples.** Item teach-by-example is include-only; add "not this" to
  remove wrongly-grabbed items.
- **Per-card confidence strip.** Show a field's value sampled across several cards while
  selecting, so the user sees consistency before previewing.
- **Mis-detection nudge.** When shape/candidate confidence is low, hint the user toward the
  List/Single toggle instead of relying on them to notice.

## Extraction & scale
- **Pagination / multi-page crawl.** Runs render a single page; real listings paginate.
  Needs crawl strategy, dedup, and politeness/rate controls.
- **Parsed-DOM cache.** The legacy HTML preview and the saved run re-parse `page.html` each
  time; cache the parsed tree per session (ADR 0008's deferred follow-up) for repeat runs.
- **Snapshot/run fidelity gaps.** Snapshot preview truncates text to ~160 chars and only
  carries captured attributes; document/handle fields where preview ≠ run (long text, exotic
  attributes).
- **Selector robustness over time.** Selectors are generated from one render; sites drift.
  Consider selector health checks / re-validation on run and alerting on match-count drops.

## Reliability & performance
- **Render robustness.** Anti-bot/CAPTCHA handling, retries, per-domain concurrency, and
  honoring robots/ToS. Multilingual consent/overlay coverage for international sites.
- **Shared cache across replicas.** `page_html_cache` is per-process; a Redis-backed shared
  cache helps multi-replica hit rates (only if measured to matter).
- **Worker scaling & backpressure.** Queue depth limits, timeouts, and dead-letter handling
  for stuck renders; the SSE stream already caps at 300 s.
- **Large pages.** Node-count cap at capture protects the snapshot; verify the matcher and UI
  overlays stay responsive on very large/long pages.

## Security, tenancy, compliance
- **SSRF & egress.** SSRF guards exist; add an allowlist/proxy egress and per-tenant domain
  policies for defense in depth.
- **Secrets & storage.** Signed/expiring URLs for screenshots; lifecycle/TTL cleanup of S3
  artifacts and Redis payloads; PII handling policy for scraped data.
- **Quotas & abuse.** Rate limits + monthly quotas exist (`limits.py`); add billing-grade
  metering, audit logs, and abuse detection for a public product.

## Quality & ops
- **Component/E2E tests.** Pure logic (reducer, selector engine) is unit-tested; the builder
  click-through is verified by running the stack. Add component tests (jsdom harness exists)
  and an E2E happy-path (render → pick → fields → preview → save → run).
- **Contract tests.** A frontend Zod schema vs backend payload mismatch is only caught at
  runtime (it has bitten us). Add a shared-contract or generated-types check.
- **Observability for the builder.** Per-step timings (render, generate, preview, run) and
  error rates; see `docs/OBSERVABILITY.md` for the current metrics surface.

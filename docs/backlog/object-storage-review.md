# Investigate — do we still need object storage (S3/MinIO), and when?

**Status:** open (investigation) · **Area:** architecture / infra / cost

## Question
We currently render each page and store **`screenshot.png` + `page.html`** in S3/MinIO. Now
that the builder **preview reads from the Redis `domNodes` snapshot** (no HTML parse) and the
**saved run re-fetches the live page**, it's worth re-checking whether durable object storage
is actually needed, and if so, for what and for how long.

## What still uses S3 today
- **`page.html`** — **read by nothing as of ADR 0015.** Its only reader was the `/preview`
  endpoint, now removed; the run extracts live in the browser and the build preview uses the
  Redis snapshot. The stored HTML (and the orphaned `page_html_cache` subsystem, see
  `skrowt-internal-cleanup.md`) is now a candidate for removal — confirm nothing else reads it,
  then stop writing it.
- **`screenshot.png`** — served to the builder canvas (`GET /page-sessions/{id}/screenshot`)
  while building. Needed during the session, but does it need to be *durable*?

## Options to weigh
- **Keep S3 as-is** — simplest; durable artifacts; current behavior.
- **Make HTML optional / drop it** — if only the (legacy) HTML preview needs it and that path
  is retired in favor of snapshot preview, `page.html` storage may be removable.
- **Move ephemeral artifacts to Redis / TTL** — the screenshot is only needed during the
  session; a short-TTL store (or Redis) could replace durable S3 for it.
- **Keep S3 only for things that must outlive a session** (e.g. run outputs/exports, if any).

## Output
A decision (record in an ADR): what object storage is for, what moves to ephemeral storage,
and the retention/TTL policy. Update `docs/reference/architecture.md` accordingly.

## Where to look
- `backend/app/page_sessions.py` (`_load_page_session_html` — now orphaned, the screenshot
  endpoint, render persistence), `backend/app/worker.py` (what it writes to S3),
  `page_html_cache.py` (orphaned, ADR 0015), and `docs/reference/architecture.md` (data-flow /
  write moments).

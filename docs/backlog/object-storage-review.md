# Investigate — do we still need object storage (S3/MinIO), and when?

**Status:** open (investigation) · **Area:** architecture / infra / cost

## Question
We currently render each page and store **`screenshot.png` + `page.html`** in S3/MinIO. Now
that the builder **preview reads from the Redis `domNodes` snapshot** (no HTML parse) and the
**saved run re-fetches the live page**, it's worth re-checking whether durable object storage
is actually needed, and if so, for what and for how long.

## What still uses S3 today
- **`page.html`** — the legacy `/preview` endpoint (`recipe_runner` parse). The fast
  `/preview/snapshot` path does **not** use it. Confirm whether anything else relies on the
  stored HTML.
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
- `backend/app/page_sessions.py` (`_load_page_session_html`, the screenshot endpoint, render
  persistence), `backend/app/worker.py` (what it writes to S3), `recipe_runner.py` (HTML use),
  `page_html_cache.py`, and `docs/reference/architecture.md` (data-flow / write moments).

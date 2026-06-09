# ADR 0008 — Short-lived in-process cache for page-session HTML

- **Status:** Accepted
- **Date:** 2026-06-09
- **Scope:** `backend/app/page_html_cache.py` (new), `backend/app/config.py`,
  `backend/app/resources.py`, `backend/app/page_sessions.py`
- **Builds on:** the "Perf follow-up" parked in CLAUDE.md and ADR 0001 Decision 5 (the
  live per-field sample, which reuses the preview endpoint).

## Context

Preview extraction re-reads the frozen `page.html` from S3/MinIO and re-parses it **on
every call**:

```
preview → API → S3 GET page.html → parse HTML → rows
```

The builder makes this loop *tight*: the live per-field sample (ADR 0001 D5) fires a
one-field preview on every selector tweak, and selector editing (ADR 0009) multiplies that
further. Each one is a full S3 round-trip plus a re-parse of an HTML document **that never
changes for the life of the page session** (the snapshot is written once at render time and
is immutable thereafter — see CLAUDE.md "Data flow").

## Decision

Put a small, best-effort, in-process cache in front of S3, keyed by the internal S3
`html_key`:

```
preview → cache hit  → parse → rows
        → cache miss → S3 GET → cache → parse → rows
```

- **`PageHtmlCache`** (new module): a thread-safe TTL + LRU cache holding the raw HTML
  string per `html_key`, bounded three ways — max entry count, max total bytes, and a
  per-item byte cap (oversized snapshots are simply not cached). Expired entries are dropped
  on access; eviction is LRU by recency. A monotonic clock is injectable so the TTL logic is
  unit-testable without sleeping. HTML contents are never logged.
- **Settings** (`PAGE_HTML_CACHE_*`): `ENABLED` (default true), `MAX_ENTRIES` (64),
  `MAX_BYTES` (128 MiB), `MAX_ITEM_BYTES` (5 MiB), `TTL_SECONDS` (defaults to
  `PAGE_SESSION_TTL_SECONDS`, so a cached snapshot can never outlive its session).
- **Lifespan**: `app.state.page_html_cache` is created at startup, or `None` when disabled.
- **Loader**: `_load_page_session_html` takes the cache, returns a hit directly, and on a
  miss reads S3 and stores the result. All existing error paths (missing `html_key`, S3
  errors) are unchanged.

## Why these choices

**Why S3 stays the durable source of truth.** S3/MinIO is the artifact store; the page
snapshot is a durable object with its own lifecycle. The cache holds nothing that isn't
already in S3 — it is a read-through accelerator, never a writer. We do **not** redesign or
remove storage.

**Why repeated S3 GETs hurt here specifically.** This isn't a cold read path — it's a
human-in-the-loop edit loop where the *same* object is fetched many times per minute. The
network round-trip and re-decode dominate, and they're pure waste against an immutable blob.

**Why in-process before Redis.** The cached value is an immutable per-snapshot blob with no
cross-replica coherence requirement — there is nothing to invalidate, because the snapshot
never changes. An in-process dict captures essentially all of the benefit (the hot loop is
one user hammering one session, served by a sticky-enough connection) with **zero new
infrastructure**, no serialization, and no extra network hop. Redis would add a moving part
to cache something we'd still have to size and evict, for a blob that's already one GET away
in S3. If a future need arises for a *shared* warm cache across replicas, Redis is the next
step — this ADR deliberately does the cheap, local slice first.

**Production behavior with multiple API replicas.** Each replica keeps its own cache. A
request that lands on a cold replica simply misses and reads S3 — identical to today, just
without the speedup for that one call. Because the snapshot is immutable, two replicas
caching the same `html_key` can never disagree, so there is no coherence problem to solve.
Worst case across replicas is a few extra S3 GETs, never a wrong result.

**Why miss / restart / eviction are all safe.** Every one of them degrades to "read from
S3," which is exactly the pre-cache behavior. A process restart drops the cache; a TTL
expiry or LRU/byte-budget eviction drops an entry; a disabled cache (`ENABLED=false`) is
`None` and the loader skips it entirely. None of these can produce a stale or wrong preview,
because correctness never depended on the cache — only latency did.

## Alternatives rejected

- **Redis-backed cache** — a shared store buys cross-replica warmth we don't need for an
  immutable per-session blob, at the cost of a network hop, serialization, and a new
  dependency on the read path. Deferred until a shared cache is actually warranted.
- **Cache the parsed DOM / tree** — would save the re-parse too, but the parsed structure is
  larger, harder to size/bound, and couples the cache to the parser. Out of scope here; the
  raw-HTML slice is the small, safe win. Revisit if parse time (not fetch time) dominates.
- **Cache keyed by URL** — the URL isn't the identity of a snapshot (re-renders produce new
  snapshots). Keying by the internal `html_key` ties the cache entry to the exact stored
  object.

## Concepts to look up

- **Read-through / look-aside cache** and **cache-aside** patterns; why a read-through
  accelerator in front of a durable store is safe when the backing object is immutable.
- **TTL + LRU eviction** and **byte-budget bounding** — keeping an in-process cache from
  becoming an unbounded memory leak.
- **Cache coherence** and why **immutability removes the invalidation problem** (no writes →
  nothing to invalidate → per-replica caches can't diverge).
- **Source of truth vs. derived/ephemeral state** — the cache is explicitly not
  authoritative; correctness must survive its total loss.

## Verification

- Unit: `tests/test_page_html_cache.py` — hit, TTL expiry, oversized-skip, LRU count
  eviction, byte-budget eviction, reinsert-without-double-count.
- Loader: `tests/test_page_session_html_loader.py` — a cache hit avoids a second S3 GET (S3
  client spied), a disabled cache reads S3 every time, oversized HTML is refetched.
- `ruff check .` clean.

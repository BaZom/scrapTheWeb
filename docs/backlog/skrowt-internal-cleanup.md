# Skrowt internal cleanup

## Summary

The visible product language is moving from **Recipe** to **Sprout** and from the old
ScrapTheWeb name to **Skrowt**. The first cleanup pass should keep runtime behavior stable and
avoid database/API migrations. This backlog item tracks the deeper cleanup that should happen
deliberately.

## Plan

- Audit remaining internal `Recipe`/`recipes` names and decide which are purely code concepts
  versus API/database contracts.
- If product wants the API contract to say `sprouts`, design a migration plan for routes,
  schemas, database table/model names, client SDK names, metrics, docs, and backward
  compatibility.
- ~~Remove the unused builder DOM-tree branch once confirmed no debug workflow depends on it.~~
  **Done (2026-06):** the dead `pickerView === "nodes"` DOM-tree view + the `pickerView` prop
  were removed (see `builder-ui-enhancements.md` §2).
- Consider consolidating sprout/run terminology helpers so UI screens do not hand-roll labels.
- Review legacy `scraptheweb_*` local storage keys, metrics, filenames, and docs.
  **Audited 2026-06:**
  - **localStorage keys** (`frontend/app/page.tsx`) — *already correct, leave as-is.* New
    `skrowt.*` keys are written; legacy `scraptheweb.*` keys are read-then-removed via
    `readStoredValue(newKey, legacyKey)`. This is the desired migration-read; removing the
    legacy keys would drop returning users' saved auth/appearance/draft.
  - **Worker heartbeat filename** — *done.* `/tmp/scraptheweb-worker-alive` →
    `/tmp/skrowt-worker-alive` in `worker.py` + `worker_healthcheck.py` (ephemeral /tmp file,
    no persistence/contract — safe).
  - **Deferred — these are persistent contracts, renaming is a deliberate migration, not a
    cleanup pass** (leave until product commits to it, then plan dashboards/data migration):
    - **Prometheus metric names** `scraptheweb_*_total` (`observability/metrics.py`, docs,
      `scripts/smoke_observability.py`) — renaming orphans historical series + breaks any
      existing dashboards/alerts; no easy alias.
    - **DB name/user/password** `scraptheweb` (`.env.example`, `docker-compose.yml`,
      `alembic.ini`) — renaming breaks existing databases/volumes; local-dev credential, no
      product value.
    - **OTEL service names** `scraptheweb-api/-worker` and **S3 bucket** `scraptheweb-local`
      (`config.py`, compose, env) — trace/object contracts; renaming orphans existing
      traces/objects.
  - **ADRs 0007 / 0011** mention `scraptheweb`/`ScrapTheWeb` — *append-only history, never
    rewrite.* Reference docs (`observability.md`, `runbook.md`) correctly document the
    *current* (un-renamed) metric names/image tags, so they stay until the contracts move.
- Revisit large workspace screens for repeated table/card patterns after the rename settles.

## Acceptance notes

- Public UI consistently says Skrowt and Sprout/Sprouts.
- Internal renames happen in small, migration-safe commits.
- Existing saved data and exports remain readable.

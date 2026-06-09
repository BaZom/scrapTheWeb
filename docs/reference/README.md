# Reference — current state (source of truth)

This folder describes **how ScrapTheWeb works right now** — the current features, flows,
architecture, files, and the concepts behind them. It is the **source of truth**: if the code
and a doc here disagree, that's a bug in one of them, and the doc is meant to be kept current.

## How this differs from `docs/adr/`

- **`docs/adr/` = history.** Numbered Architecture Decision Records capture *why* a change was
  made, the alternatives rejected, and when. They are append-only and dated; you read them to
  understand *how we got here*. They are **not** updated to reflect later changes.
- **`docs/reference/` = present.** These files describe *what is true today*, with **no
  implementation history**. When behavior changes, **update the relevant reference file in the
  same change** (and add/extend an ADR for the *why*).

## Maintenance rule (project convention)

> When you change a feature, flow, file layout, or concept covered here, **update the matching
> `docs/reference/` file in the same commit**. Keep these accurate and free of history (history
> lives in ADRs). New major areas get their own file here.

This rule is also recorded in `CLAUDE.md` and `AGENTS.md` so every agent/contributor follows it.

## Index

- **[architecture.md](architecture.md)** — the system at a glance: components, the render →
  extract pipeline, where data lives and when it's written, key files. (Complements the
  longer narrative in `docs/ARCHITECTURE.md`.)
- **[builder.md](builder.md)** — the recipe builder in depth: the end-to-end UI flow, the
  no-code design principles, the reducer state machine, the selection model, selectors &
  extraction, the files/classes involved, and the concepts behind them.
- **[production-readiness.md](production-readiness.md)** — broad limitations and directions to
  harden before/at production scale. (Concrete open bugs + specific planned tickets live in
  **`docs/backlog/`**, not here.)

## Related docs

- `docs/ARCHITECTURE.md` — system components & deployment narrative.
- `docs/RUNBOOK.md` — operating the stack.
- `docs/OBSERVABILITY.md` — metrics, logs, tracing.
- `docs/adr/` — decision history (0001–0009).

# ADR 0012: Local control-plane persistence and run-control model

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

Through M2.1, `wee serve` (`core/server/server.go`) is a read-mostly server: it lists and audits recorded
executions, streams events over WebSocket (ADR 0010), starts runs (`POST /api/run`), imports templates,
edits Workers, and sets in-memory secrets (M1.14e). By design it holds no engine state of its own and
reconstructs everything from the on-disk log (PRIN-02) — executions (`.workflow/executions/<id>/`),
content-addressed artifacts (`.workflow/artifacts/`), and the cache index (`.workflow/cache/index.json`)
already survive a restart.

M2.2 ("Local Control Plane") asks for a *durable local service, not a fragile demo server.* Three concrete
gaps stand between today's server and that goal:

1. **In-flight runs are unmanageable.** `runStarter` (`cli/cmd/serve.go`) launches a run on
   `context.Background()` and **discards the returned cancel function**. There is consequently no way to
   cancel a run started through the API, and a server restart orphans any in-flight run: it has an
   `ExecutionStarted` event but no terminal event, so `summarize` reports it as `running` forever.
2. **Settings do not persist.** Provider base URLs, the default budget, cache mode, workspace root, and
   template paths live only as CLI flags plus in-memory env (M1.14e made secrets in-memory-only,
   owner-confirmed 2026-07-20). Nothing survives a restart, so every `wee serve` starts blank.
3. **Long runs look stuck.** Beyond raw events, a client has no progress or liveness signal — it cannot
   distinguish "still working" from "silently wedged."

The design fork worth recording: **how to persist control-plane state, and how to surface progress**,
without turning the append-only, hash-chained event log (ADR 0007, REQ-EVENT-01's *closed* catalog) into a
second, mutable state store. Two facets were the project owner's call (session decision 2026-07-21):
persistence stays in the per-workspace `.workflow/` rather than a new OS-level config dir, and progress is
transport-derived rather than a new persisted event type.

## Decision

We will make `wee serve` durable by adding a thin control-plane layer over the existing on-disk record and
existing engine capabilities — never a parallel source of truth.

1. **Persistence stays in-workspace.** Settings persist to `.workflow/settings.json`; executions,
   artifacts, and the cache index keep their existing homes. No OS-level config/data-dir split is
   introduced now — M2.6 (Self-Hosted Packaging) explicitly owns that convention. The "execution index"
   and "workflow catalog" M2.2 names are *derived views* over the existing `executions/` directory and the
   `--dir` workflow tree, not new stores.

2. **An in-memory run registry replaces the discarded cancel func.** The server keeps a map
   `execID → context.CancelFunc` for runs it starts, so the cancel control cancels the run's context
   through the same cooperative path M1.3 already guarantees (REQ-RUNTIME-05: emit `Cancelled`, persist
   partial state, join goroutines). The registry is authoritative for *liveness only* — history always
   remains the log.

3. **Restart reconciliation, using the existing catalog.** On startup the server scans `executions/`; any
   run with an `ExecutionStarted` but no terminal event (`ExecutionFinished`/`Cancelled`/`Failure`) that is
   not in the live registry was interrupted by a prior process. The server appends a `Cancelled` event —
   an **existing** catalog type, so REQ-EVENT-01 stays closed and ADR 0007's hash chain continues
   unbroken — marking it terminal-and-resumable. It is never reported as silently `running`, and `resume`
   continues it from the record (REQ-RUNTIME-06).

4. **Run controls are thin HTTP surface over core capabilities.** start, cancel, retry-failed,
   retry-from-node, resume, replay, clear-cache, and export-execution-bundle each map to an existing
   engine/core capability: cancel → context cancellation (REQ-RUNTIME-05); resume/retry → resume-from-record
   (REQ-RUNTIME-06, reusing persisted artifacts so finished work is neither re-run nor re-charged, PRIN-05);
   replay → `core/replay`; clear-cache → `core/cache` (extended from today's all-or-nothing `Clear()` to a
   granular clear by workflow/node key). Only **export-execution-bundle** is genuinely new: a tar of one
   recorded run's snapshot + `events.jsonl` + referenced artifacts, mirroring `registry.Export`'s tar
   approach but for an execution rather than a definition — no secrets, per PRIN-10.

5. **Settings are references, never secrets.** `settings.json` records provider base URLs, the default
   budget, cache mode, workspace root, and template paths — and *which* env var/keychain entry a provider's
   key comes from, never the key value (PRIN-10). The M1.14e in-memory secret model is unchanged; this ADR
   does not reverse it.

6. **Progress is transport-derived, not logged.** The live stream carries a derived progress summary
   (completed/total nodes, currently-running nodes) computed from the events already in the log, plus a
   wall-clock liveness tick. None of it is written to `events.jsonl`: the catalog stays closed
   (REQ-EVENT-01) and the hash chain stays free of non-semantic noise (PRIN-09).

7. **Per-run budget/cache overrides.** `POST /api/run` gains optional `budget` and `cache` fields; when
   supplied they are recorded in the frozen snapshot (REQ-EVENT-04, already the home of per-run config), so
   an audit still answers "what limits did this run actually run under."

8. **Durable writes.** `settings.json` and any derived index the server caches are written temp-then-rename,
   so a crash mid-write cannot corrupt them — the "durable, not fragile" bar M2.2 sets.

## Consequences

- **Easier:** a `wee serve` process can be killed and restarted without losing completed executions,
  settings, cache, or the ability to resume an interrupted run; a run can be cancelled, retried from a
  failed node, resumed, and replayed from the UI or API; a long run reports honest progress instead of a
  frozen spinner; an execution can be exported as a portable bundle for audit or sharing.
- **Harder:** the server now holds a small amount of process-local state (the run registry) that must be
  reconciled against disk on startup — the one place the "server holds no state" purity is relaxed, and
  deliberately so. Reconciliation must run before the server accepts its first request.
- **Neutral/limits:** persistence remains single-workspace and single-process; no OS config dir, no shared
  or multi-user state (M2.6/M2.7 own those). Progress is best-effort and derived — it is not part of the
  audit record and carries no integrity guarantee, by design. Budget accounting on resume still restarts
  from zero (REQ-RUNTIME-06's accepted limitation) — this ADR does not change it.
- **Revisit trigger:** introducing an OS-level config/data-dir split, cross-workspace shared state, a
  persisted progress/heartbeat event, or multi-process serving each needs a new ADR, not an amendment to
  this one.

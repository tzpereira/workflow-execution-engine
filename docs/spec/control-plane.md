# Spec — Local Control Plane

**Prefix:** `REQ-CTRL` · **Status:** DRAFT (delivery M2.2) · **Principles:** PRIN-01, PRIN-02, PRIN-05,
PRIN-10 · **Decisions:** ADR 0012 (control-plane persistence and run-control model) ·
**Implementation:** `core/server/`, `cli/cmd/serve.go`

`wee serve` is the durable local service: a client (the UI, an API caller) starts, controls, and inspects
executions through it, and it survives being killed and restarted. It is still a pure client of the event
log for *history* (PRIN-02) — the control plane adds process-local liveness and on-disk settings, never a
second record of what happened. The requirements below hold whether the service is driven from the UI or
directly over HTTP.

### REQ-CTRL-01 — Durable service across restarts
When `wee serve` restarts, the service shall reconstruct completed executions, resumable state, persisted
settings, the cache index, and its derived execution index from disk alone, losing none of them.
- **Rationale:** PRIN-01 (the record is the state) — a local service a developer uses weekly cannot forget
  its history on every restart.
- **Delivered by:** M2.2. **Verified by:** _pending_.

### REQ-CTRL-02 — In-flight registry and orphan reconciliation
While an execution it started is in flight, the service shall hold a cancel handle for it; and on startup,
if an execution has an `ExecutionStarted` event but no terminal event and is not in the live registry, the
service shall reconcile it to a terminal, resumable state (appending a `Cancelled` event from the existing
catalog) and shall never report it as silently running.
- **Rationale:** PRIN-02 — an interrupted run must not masquerade as live; reuses REQ-RUNTIME-05's
  cancellation path and REQ-EVENT-01's closed catalog (no new event type — ADR 0012).
- **Delivered by:** M2.2. **Verified by:** _pending_.

### REQ-CTRL-03 — Run controls over the API
The service shall expose start, cancel, retry-failed, retry-from-node, resume, replay, clear-cache (for a
workflow or a node), and export-execution-bundle controls, each mapping to an existing core capability
without becoming a second source of truth.
- **Rationale:** PRIN-06 — the control plane orchestrates existing engine behavior (REQ-RUNTIME-05 cancel,
  REQ-RUNTIME-06 resume, REQ-REPLAY replay, REQ-CACHE clear), it does not re-implement it.
- **Delivered by:** M2.2. **Verified by:** _pending_.

### REQ-CTRL-04 — Retry and resume never re-pay for finished work
When retrying a failed node or resuming an execution, the service shall reuse every completed upstream
node's persisted artifact and every cached node, re-executing and re-charging only the remaining work.
- **Rationale:** PRIN-05 — finished work is never paid for twice; the control-plane surface must preserve
  REQ-RUNTIME-06's guarantee, not bypass it.
- **Delivered by:** M2.2. **Verified by:** _pending_.

### REQ-CTRL-05 — Settings persist as references, never secrets
The service shall persist settings — provider references and base URLs, default budget, cache mode,
workspace root, and template paths — under the workspace, and shall never write secret key material to
disk; secrets remain env/keychain references (PRIN-10).
- **Rationale:** PRIN-10 — a durable service must remember its configuration without ever serializing a
  secret; consistent with M1.14e's in-memory secret model (ADR 0012 does not reverse it).
- **Delivered by:** M2.2. **Verified by:** _pending_.

### REQ-CTRL-06 — Progress and liveness without polluting the log
While an execution runs, the service shall surface derived progress (completed and total nodes, currently
running nodes) and a liveness signal over the live transport, and shall not write heartbeat or progress
entries into the append-only, hash-chained event log.
- **Rationale:** a long run must never look silently stuck (PRIN-02), but the closed catalog (REQ-EVENT-01)
  and the hash chain (PRIN-09) stay free of non-semantic noise — progress is derived from existing events,
  not recorded as new ones (owner decision 2026-07-21, ADR 0012).
- **Delivered by:** M2.2. **Verified by:** _pending_.

### REQ-CTRL-07 — Per-run budget and cache overrides
When starting a run, the service shall accept an optional per-run budget and cache mode, apply them to that
run, and record them in the frozen execution snapshot.
- **Rationale:** PRIN-05 — spend limits and reuse policy are visible and editable before a run and recorded
  for audit (REQ-EVENT-04 is already the home of frozen per-run config).
- **Delivered by:** M2.2. **Verified by:** _pending_.

### NFR-CTRL-01 — Crash-safe persistence
The service shall write `settings.json` and any cached index with a temp-then-rename sequence, such that a
process crash mid-write leaves the previous durable state intact rather than a truncated file.
- **Rationale:** PRIN-01 — "durable local service, not a fragile demo server" (M2.2) requires that an
  ill-timed kill never corrupts persisted state.
- **Delivered by:** M2.2. **Verified by:** _pending_.

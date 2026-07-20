# Event

Non-normative. The testable rules are [spec/events.md](../spec/events.md) (`REQ-EVENT-*`). Implementation:
`core/domain/event.go`, `core/eventlog/`.

An Event is an immutable, timestamped record of something that happened during an Execution. Events are the
**single source of truth** (PRIN-02): every other view of an execution — `wee run`'s live terminal output,
`--json`, `wee inspect`, `wee replay`, the UI's live stream and Inspector — derives from the same append-only
log, never a second, independently-updated record.

## The catalog

```
ExecutionStarted · ExecutionFinished
WorkerStarted · WorkerFinished
ToolCalled · ToolResult
ArtifactCreated
ContractValidated · ContractViolation
Retry
Failure
CacheHit · CacheMiss
BudgetWarning · BudgetExceeded
Cancelled
```

A node's happy path (`core/engine/node.go`) emits, in order: `WorkerStarted` → `CacheHit` **or**
`CacheMiss` → (`ToolCalled`/`ToolResult`, `Retry`/`ContractViolation` — zero or more, tool-backed and
retry paths respectively) → `ArtifactCreated` → `WorkerFinished`. A terminal failure emits `Failure`
instead of `ArtifactCreated`/`WorkerFinished` — the absence of those two events, not a separate "failed"
event type, is what the reducer treats as failure.

## Hash-chained, tamper-evident (REQ-EVENT-03, ADR 0007)

Every event carries the canonical hash of its predecessor. Editing, deleting, or reordering a past event
breaks the chain from that point forward — detectable by a verification pass over the log, without needing
external anchoring for in-log tampering (truncating the *tail* of a log and stopping there is a disclosed,
out-of-scope gap; see ADR 0007). This is what makes replay and audit trustworthy: not "we assume the log is
honest," but "a broken chain is provable."

## What a payload carries

Payloads are intentionally plain `map[string]any`, not a typed struct per event — different event types
carry genuinely different shapes (`WorkerFinished`'s `costUsd`/`tokens`/`contextHashes` vs.
`ContractViolation`'s `error` string), and the wire format is what `wee run --json`, `wee serve`'s WebSocket
stream, and the UI's `core/live.ts` reducer all agree on byte-for-byte — one schema, three consumers.

## Related

- [execution.md](execution.md) — the thing an Event describes
- [context-policy.md](context-policy.md) — REQ-CTXPOL-03's admitted-hashes payload
- [../replay-honesty.md](../replay-honesty.md) — exactly what reconstructing from events alone does and does
  not guarantee

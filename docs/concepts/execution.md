# Execution

Non-normative. The testable rules are [spec/runtime.md](../spec/runtime.md) (`REQ-RUNTIME-*`) and
[spec/replay.md](../spec/replay.md) (`REQ-REPLAY-*`). Implementation: `core/engine/scheduler.go`,
`core/replay/audit.go`.

An Execution is a single run of a Workflow. Everything else in the system exists to make one Execution
correct, cheap, and reconstructable — its state, the resolved graph, its Artifacts, its Events, its costs,
its Budget status, its cache hits/misses, and its timestamps.

## What gets frozen at start

`engine.Snapshot`, written once, before any node runs:

```go
type Snapshot struct {
	Workflow         domain.Workflow
	Budget           domain.Budget
	Concurrency      int
	DefinitionHashes map[string]string        // "id@version" -> content hash, REQ-VERSION-02
	Workers          map[string]domain.Worker // the full pinned definitions, M1.13
}
```

This is what makes audit replay honest: a definition can move on (a Worker gets rewritten at a bumped
version, a workflow file gets edited) without corrupting what a *past* execution is understood to have run.
`replay.Auditor` never consults the current registry — only the frozen snapshot plus the event log.

## Two ways to look at a past Execution

- **Audit** (`wee replay <id>`, `core/replay.Auditor.Audit`) — reconstructs the full timeline from disk
  alone: zero model calls, zero cost, zero network. Cannot reach a model or a Tool even by accident — the
  `Auditor` type structurally holds no reference to either.
- **Re-execution** (`wee replay <id> --execute`, `core/replay.Reexecuter`) — runs the frozen snapshot again
  through the same Scheduler, so the Node Cache naturally reuses every unchanged node at $0; only nodes
  whose inputs actually changed re-run. `Divergence` classifies each node `cached`/`re-executed`/`added`/
  `removed` between two timelines — a byte-equality report, not a claim about *why* something changed. See
  [replay-honesty.md](../replay-honesty.md) for exactly what this does and doesn't guarantee.

## Resumable, not just re-runnable

`wee run --resume <id>` restarts a cancelled or crashed execution from its last complete node, reusing every
already-persisted Artifact — a genuinely different code path from re-execution above (it appends to the
*same* execution's log rather than starting a new one), but the same underlying guarantee: nothing that
already ran correctly re-runs.

## Related

- [event.md](event.md) — the append-only record an Execution's state is derived from
- [budget.md](budget.md) — the limits every Execution enforces before, not after, the spend
- [../cache-deep-dive.md](../cache-deep-dive.md) — how re-execution gets its cache hits

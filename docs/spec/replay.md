# Spec — Replay

**Prefix:** `REQ-REPLAY` · **Status:** STABLE (delivery M1.7) · **Principles:** PRIN-01, PRIN-05 ·
**Implementation:** `core/replay/` (M1.7)

Any execution can be replayed — honestly. Replay never pretends LLMs are deterministic; it distinguishes
inspecting the record from re-running the process.

### REQ-REPLAY-01 — Audit replay, zero cost
The engine shall render a recorded execution (timeline, events, artifacts, costs) purely from its snapshot,
event log, and artifact store — zero model calls, zero cost, byte-identical artifacts.
- **Rationale:** PRIN-01 — "audited exactly as it happened" is a read, not a re-run.
- **Delivered by:** M1.7 (`replay.Auditor`, holds no reference to a Scheduler or NodeExecutor). **Verified
  by:** `replay.TestAuditReconstructsSucceededFailedAndSkippedNodes` (a call counter on the test executor
  proves Audit adds zero invocations), `replay.TestAuditUnknownExecutionErrors`.

### REQ-REPLAY-02 — Re-execution with identical configuration
When asked to re-execute, the engine shall run the frozen workflow version with identical graph, contracts,
and context policies; cached nodes are reused (REQ-CACHE-02) and only invalidated nodes reach a model.
- **Rationale:** PRIN-01 (same process) + PRIN-05 (pay only for what changed).
- **Delivered by:** M1.7 (`replay.Reexecuter`, reads the frozen `engine.Snapshot` and runs it through the
  same `Scheduler`/cache/store). **Verified by:** `replay.TestReexecuteReusesCacheForUnchangedNodes`,
  `replay.TestReexecuteUnknownOriginalErrors`.

### REQ-REPLAY-03 — The two modes are never conflated
The CLI and UI shall present audit replay and re-execution as distinct operations with distinct names and
costs; documentation shall state plainly what is and is not guaranteed to be identical. `replay.Divergence`
classifies each node between an original and a re-execution as `cached` (byte-identical artifact hash),
`re-executed` (hash differs), or `added`/`removed` (present in only one Timeline) — a byte-equality report,
not a claim about *why* the bytes matched or differed (docs/replay-honesty.md).
- **Rationale:** honesty about nondeterminism is a stated differentiator (PRIN-01's caveat).
- **Delivered by:** M1.7 (core divergence report), M1.9 (CLI), M1.15 (docs page). **Verified by:**
  `replay.TestReexecuteAndDivergenceLabelChangedNodeAndDownstream` (one node's contract changes; it and its
  downstream re-execute, the rest stays cached), `replay.TestDivergenceClassifiesAddedAndRemoved`.

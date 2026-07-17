# Spec — Event System

**Prefix:** `REQ-EVENT` · **Status:** DELIVERED (M1.2, hash-chain retrofit M1.4) ·
**Principles:** PRIN-01, PRIN-02, PRIN-09 · **Decisions:** ADR 0007 (hash chain) ·
**Implementation:** `core/domain/event.go`, `core/eventlog/`

Everything emits events; events power logs, replay, live rendering, and audit. The event log is the
execution's single source of truth — the UI, the CLI's `--json` mode, and replay are all pure consumers of
the same stream.

### REQ-EVENT-01 — Closed v1 catalog
The engine shall emit only events from the versioned v1 catalog: `ExecutionStarted`, `ExecutionFinished`,
`WorkerStarted`, `WorkerFinished`, `ToolCalled`, `ToolResult`, `ArtifactCreated`, `ContractValidated`,
`ContractViolation`, `Retry`, `Failure`, `CacheHit`, `CacheMiss`, `BudgetWarning`, `BudgetExceeded`,
`Cancelled` — extending the catalog is a schema change, not an ad-hoc string.
- **Rationale:** PRIN-02; consumers can rely on the vocabulary.
- **Delivered by:** M1.1 (catalog), M1.2 (log). **Verified by:** schema tests, `TestSchemaDrift`.

### REQ-EVENT-02 — Append-only JSONL log per execution
The engine shall append each event as one JSON line to the execution's log
(`executions/<id>/events.jsonl`), such that the ordered timeline is reconstructable from disk alone.
- **Rationale:** PRIN-01 — the record is the state (resume and replay read nothing else).
- **Delivered by:** M1.2. **Verified by:** `TestReconstructTimelineFromDiskAlone`,
  `TestReadAllMissingIsError`.

### REQ-EVENT-03 — Hash-chained integrity
The engine shall include in every event the hash of the preceding event in its execution's log (genesis
events chain from the execution snapshot's hash), and shall provide a verification routine that detects
any edit, deletion, or truncation of history.
- **Rationale:** PRIN-09 — append-only by *convention* becomes tamper-evident by *construction*; the audit
  pitch depends on it. (Decision 2026-07-15: retrofit now, before real executions exist to migrate.)
- **Delivered by:** M1.4 (retrofit task, amends M1.2's log format before any real executions exist).
- **Verified by:** `eventlog.TestVerifyDetectsTamper` (corrupt one line → `Verify` fails, names the break),
  `TestVerifyCleanChain`, `TestVerifyDetectsGenesisBreak`.

### REQ-EVENT-04 — Frozen execution snapshot
When an execution starts, the engine shall write a frozen snapshot (workflow, budget, concurrency) that
replay and resume read instead of re-resolving anything live.
- **Delivered by:** M1.2/M1.3. **Verified by:** `TestResumeSkipsFinishedNodes` (reads snapshot + events
  only).

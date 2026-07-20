# Spec — Workflow Runtime

**Prefix:** `REQ-RUNTIME` · **Status:** DELIVERED (M1.3) except resume-budget note; M1.16 pending ·
**Principles:** PRIN-01, PRIN-02, PRIN-05 · **Implementation:** `core/engine/`

The runtime executes a workflow graph deterministically: goroutine-native scheduling, dependency-driven
dispatch, bounded concurrency. The *engine* owns control flow — retries, branching, halting are engine
decisions, never model decisions (PRIN-05).

### REQ-RUNTIME-01 — Dependency-driven parallel dispatch
The engine shall dispatch a node when — and only when — all of its incoming edges are active, running
independent ready nodes concurrently up to the configured worker-pool size (default 4).
- **Rationale:** parallel lanes are the point of a graph; an AND-join keeps merges deterministic (PRIN-01).
- **Delivered by:** M1.3. **Verified by:** `TestDiamondParallelism`.

### REQ-RUNTIME-02 — Conditional edges
When a node finishes, the engine shall evaluate each outgoing edge's optional `{path, op, value}` predicate
against the node's artifact (dotted-path lookup, ops: eq, ne, gt, gte, lt, lte, exists, truthy); an edge
whose predicate is false is inactive, and a node with no active incoming path is skipped, cascading.
- **Rationale:** branching is data-driven and auditable, not model-driven (PRIN-05); evaluator is
  hand-rolled on `encoding/json` (PRIN-07, EXECUTION §1a gjson entry).
- **Delivered by:** M1.3. **Verified by:** `TestConditionalEdgeSkipsAndRuns`, `TestEvalCondition`,
  `TestEvalConditionErrors`.

### REQ-RUNTIME-03 — Retry classes with exponential backoff
If a node execution fails with a **transient** error, then the engine shall retry it with exponential
backoff up to the node's retry limit; **contract-violation** errors follow the contract feedback path
(REQ-CONTRACT-02); **fatal** errors (the default class) fail the node immediately without retry.
- **Rationale:** PRIN-05 — the engine decides retries; unclassified errors must not silently burn spend.
- **Delivered by:** M1.3 (classes + backoff); M1.4 wires contract violations. **Verified by:**
  `TestRetryOnTransientError`.

### REQ-RUNTIME-04 — Failure policies
If a node exhausts its retries, then the engine shall apply the node's failure policy: `fail-execution`
(default — halt, mark execution failed), `continue` (independent branches proceed; execution still reports
failed), or `fallback-node` (run the named dedicated fallback node instead). A fallback node shall never be
scheduled as an ordinary root.
- **Delivered by:** M1.3. **Verified by:** `TestFailurePolicyContinue`, `TestFailurePolicyFallback`.

### REQ-RUNTIME-05 — Cooperative cancellation without leaks
When the execution's context is cancelled (SIGINT, API, deadline), the engine shall stop dispatching, emit
`Cancelled`, persist partial state, and join every worker goroutine before returning — no goroutine leaks,
and in-flight nodes interrupted by the cancellation are not misreported as node failures.
- **Delivered by:** M1.3. **Verified by:** `TestCancellationNoGoroutineLeak`.

### REQ-RUNTIME-06 — Resume from record
When asked to resume an execution, the engine shall reconstruct state from the frozen snapshot and event
log alone, treat every node with a recorded `WorkerFinished` as done (reusing its persisted artifact), and
execute only the remainder, appending to the same log.
- **Rationale:** PRIN-01 (the record is the state), PRIN-05 (finished work is never paid for twice).
- **Known limitation (accepted, MVP):** budget accounting restarts from zero on resume — prior spend is not
  recounted. Revisit in M2.0.
- **Delivered by:** M1.3. **Verified by:** `TestResumeSkipsFinishedNodes`.

### REQ-RUNTIME-07 — Persistent human approval before mutation
When a workflow reaches its first mutating tool operation, the runtime shall pause before dispatch, persist
an approval checkpoint in the execution record, and continue only after an explicit approval tied to that
execution and checkpoint; rejection shall terminate the path without invoking the tool.
- **Rationale:** a model may propose a change, but control of repository mutation remains with the human by
  default (PRIN-05). Persistence prevents a server restart or disconnected UI from changing the decision.
- **Delivered by:** M1.16. **Verified by:** _pending_.

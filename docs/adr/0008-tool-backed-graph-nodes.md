# ADR 0008: Tool-backed graph nodes

- **Status:** Accepted
- **Date:** 2026-07-17

## Context

The flagship demo (VISION.md "Flagship Demo", EXECUTION.md M1.15) needs graph nodes like "Test Runner
(terminal tool)" and "Commit (git tool)" that run a `core/tool.Tool` deterministically — no LLM ever decides
the tool's input (ADR 0006: "tools execute engine-side, not via provider-native function-calling"). Nothing
wires this today: `core/tool.Invoke` (M1.5) is fully built and tested but never called from `core/engine`;
`Worker.Tools []string` is purely a cache-key input (`core/engine/worker_executor.go`'s `CacheKey`), never
read by any executor. `docs/spec/workers.md`'s REQ-WORKER-02 already anticipates "tool-backed... executors"
in prose, without any milestone ever delivering it — this is a disclosed, pre-existing gap, not new scope.

Two choices are genuinely contested and worth recording:

1. **Where does "this node is tool-backed" live?** Extending `domain.Worker` (making `Model`/`Contract`
   optional) would reopen `worker.schema.json`'s `required` list — the schema most heavily fixture-tested
   across `core/contract`, `core/engine`, `core/serialize` — and would muddy `spec/workers.md`'s existing,
   unambiguous definition of Worker as "an LLM role." The alternative is extending `domain.Node` with a new,
   mutually-exclusive field, leaving `Worker` untouched.
2. **How does a tool-backed executor reach the event log** for per-call `ToolCalled`/`ToolResult` audit
   events (REQ-TOOL-02), given `NodeExecutor` implementations never touch `Scheduler`'s event log today, and
   `Scheduler.exec` is a single field called concurrently from a goroutine pool for independent ready nodes?

M1.6 declared the domain model frozen. This ADR is an explicit, narrow, disclosed exception to that freeze:
it adds one field to `domain.Node` and leaves `domain.Worker`/`worker.schema.json` completely untouched.

## Decision

We will add a new, mutually-exclusive `Tool *ToolCall` field to `domain.Node` (alongside the existing
`Worker string`), with `core/validate/graph.go` enforcing exactly one of the two is set per node — a
Go-level semantic rule, not a JSON Schema `oneOf`, matching how `graph.go` already owns cross-field rules
(cycles, artifact ancestry) while `schema.json` owns shape. `Worker` and `worker.schema.json` are untouched.

A new `ToolExecutor` implements `NodeExecutor`, resolving a node's `ToolCall` against a `tool.Registry` and
invoking it via the existing `tool.Invoke` — deterministically, with no model ever selecting or shaping the
tool call's input. A new `DispatchExecutor` composes `WorkerExecutor` and `ToolExecutor` behind
`Scheduler`'s single `exec` field, routing each node by `Node.Tool != nil`, preserving REQ-WORKER-02's
"identical seam" guarantee for both kinds in one graph.

Tool audit events reach the log via a new optional capability interface, `ToolEmitter`, mirroring the
existing `CacheKeyer` pattern exactly: `ExecuteWithEmit(ctx, req, emit) (NodeResult, error)`, where `emit` is
a per-call closure bound to that call's execution/node id, passed as a parameter — never a mutated field on
the shared executor instance (which would be a data race under the scheduler's concurrent goroutine pool).

A tool-backed node's static `Input` may reference an upstream artifact field via the whole-string placeholder
`"${nodeID.path}"` (resolved by reusing the existing private `lookupPath` dotted-path walker from
`core/engine/conditional.go` — zero new parsing library) and an environment secret via `"${env:NAME}"`
(resolved from `os.LookupEnv` at call time). Resolved env values are redacted from any event payload,
returned error text, or the resulting artifact content before they reach the log or the store — a tool's
real output can legitimately echo back what it was given (e.g. `curl -v`'s stderr printing the request
headers it sent), so the stored artifact needs the same treatment as the log. Narrowly scoped to this new
code path (the general M2.0 redaction pass remains separate, deferred scope). No embedded/concatenated
interpolation — a workflow
needing a composed multi-field string pushes that composition into a Worker's Contract output instead.

`ToolExecutor` does not implement `CacheKeyer`; tool-backed nodes never populate a cache key. A Tool is an
opaque interface — the engine cannot see whether `Execute` reads ambient state (a `git diff` call has zero
placeholders yet is exactly the case where caching would be actively wrong, serving a stale diff to a
reviewer). A correct middle ground would need a new, separate per-Tool purity capability; that's out of
scope here.

## Consequences

- **Easier:** zero changes to `NodeExecutor`'s core signature (existing executors and their tests are
  untouched); zero changes to `domain.Worker`/`worker.schema.json` (the M1.6 freeze stays intact for
  Worker); zero new tool code needed for GitHub API access (the existing generic `http` tool plus a domain
  allowlist entry and the new placeholder mechanism covers it).
- **Harder:** a workflow author composing a multi-field textual tool payload (e.g. a GitHub review body)
  cannot interpolate several upstream fields into one tool-node string — that composition must live in a
  Worker's Contract output instead, one field the tool node then references whole.
- **Neutral/limits:** tool-backed nodes are conservatively never cached in v1, even when their input is
  fully static or artifact-derived — correctness is prioritized over the (currently undemonstrated) benefit
  of caching a subset of tool calls.
- **Revisit trigger:** if tool-result caching is ever needed, it requires a new per-Tool "purity" signal
  (e.g. a `Deterministic() bool` capability) — a new ADR, not an amendment to this one.

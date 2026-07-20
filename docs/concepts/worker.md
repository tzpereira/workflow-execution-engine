# Worker

Non-normative. The testable rules are [spec/workers.md](../spec/workers.md) (`REQ-WORKER-*`).
Implementation: `core/domain/worker.go`, `core/engine/worker_executor.go`; schema at
`schemas/worker.schema.json`.

A Worker is a role in a Workflow — an objective, a set of constraints, the Tools it may call, a Context
Policy declaring what it's allowed to see, and an output Contract. Workers are interchangeable by design: a
Worker is fully described by these five things, never by hidden state.

## Shape

```go
type Worker struct {
	ID            string
	Version       string
	Objective     string          // what this role is for, in prose
	Constraints   []string        // hard rules the model must follow
	Tools         []string        // names of Tools this Worker may invoke
	ContextPolicy ContextPolicy   // see context-policy.md
	Contract      Contract        // see contract.md
	Model         ModelConfig     // provider, model, params
}
```

A Worker is a **separate, independently versioned definition** from any Workflow that references it —
`node.worker: "reviewer@1.0.0"` is a reference, not an inline body. This is why the same Worker (e.g. a
style reviewer) can be reused across workflows, and why bumping a Worker's Contract doesn't require
re-authoring the Workflow that uses it (see [versioning.md](versioning.md)).

## Execution, step by step

`core/engine/worker_executor.go` runs, per node, in this order (every step emits its own Event —
see [event.md](event.md)):

1. Resolve the Context Policy against the node's direct-parent Artifacts (`core/policy`).
2. Compile the Contract into the model call (goal + rules + output schema + resolved context — the *only*
   place this compilation happens, never exposed as a raw string anywhere else).
3. Call the model (`core/model`, one `Provider` interface, vendor SDKs never imported — ADR 0006).
4. Validate the raw output against `contract.outputSchema`. On failure: retry with the validation error
   appended as feedback (never a re-inflated context), up to `contract.maxRetries` times; after that, fail
   the node with a `ContractViolation` event.
5. Store the validated output as an Artifact, price the call, and record it.

A Worker never decides *how* it runs — retries, budget checks, and cancellation are the engine's loops, not
the model's (PRIN-01). A Worker only ever produces one thing: a Contract-valid Artifact, or a recorded
failure.

## Tool-backed nodes are not Workers

A node can be Tool-backed instead (`node.tool`, not `node.worker`) — a deterministic action (filesystem,
terminal, git, HTTP) with no model in the loop at all (ADR 0006, ADR 0008). See
[tools.md](tools.md). The two kinds share a graph, a cache, and an event catalog, but a Tool-backed node's
input is never shaped by a model — it is either a literal value or a whole-string placeholder resolved
mechanically (`${nodeID.path}` / `${env:NAME}`, REQ-WORKER-06).

## Related

- [contract.md](contract.md) — the enforced output specification every Worker carries
- [context-policy.md](context-policy.md) — what a Worker is allowed to see
- [../writing-contracts.md](../writing-contracts.md) — a practical guide to writing a tight Contract

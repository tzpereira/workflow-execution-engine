# Workflow

Non-normative. The testable rules are [spec/definition.md](../spec/definition.md) (`REQ-DEF-*`) and
[spec/runtime.md](../spec/runtime.md) (`REQ-RUNTIME-*`). Implementation: `core/domain/workflow.go`,
schema at `schemas/workflow.schema.json`.

A Workflow is a versioned, serializable graph of nodes and edges — the unit of authorship, versioning, and
execution. Everything else in the system (Workers, Contracts, Artifacts, Events, Budget) exists to make one
Workflow run correctly, cheaply, and auditably.

## Shape

```go
type Workflow struct {
	ID       string
	Version  string
	Nodes    []Node
	Edges    []Edge
	Defaults *Defaults // optional model/contextPolicy applied where a node doesn't set its own
	Budget   Budget
}
```

A **node** is exactly one of Worker-backed or Tool-backed (`core/validate/graph.go` rejects both-or-neither
at validation time) — never a third kind, and never a node that is "sometimes a Worker, sometimes a Tool."
An **edge** connects two nodes and may carry a `condition` (a predicate on the source node's own output —
see [context-policy.md](context-policy.md) for how that data reaches a downstream node, and
`spec/runtime.md`'s conditional-edge requirement for the predicate grammar: `eq`/`ne`/`gt`/`gte`/`lt`/`lte`/
`exists`/`truthy`).

## Authoring

Two doors into the same room (PRIN-02) — a workflow authored either way compiles to the identical canonical
form and hashes identically:

- **YAML/JSON directly** — the canonical, language-neutral form (ADR 0003: YAML canonical, JSON
  equivalent). Every example under `examples/` is this.
- **The Go SDK** (`sdk/`) — a fluent builder (`workflow.New/.Worker/.Tool/.Parallel/.Merge/.Build`)
  compiling to the exact same `domain.Workflow` a YAML file produces. See [sdk.md](sdk.md).

The UI (`ui/`) is a third client of the same format, never a proprietary one — import/export round-trips
byte-for-byte modulo formatting (REQ-UI-01).

## Validation

`wee validate` (and the engine, before running) checks two independent things:

1. **Schema** — does the document match `schemas/workflow.schema.json`? (required fields, correct types,
   closed enums).
2. **Graph** — no cycles, no orphan nodes, every edge's `from`/`to` resolves to a real node, every
   conditional edge's `path` is at least syntactically sane, exactly one of `worker`/`tool` per node.

Both must pass before a run starts; a schema-valid-but-cyclic graph is still rejected (`core/validate/graph.go`).

## Parameterizing a run — Inputs (REQ-INPUT-01, M1.14a)

A Workflow can declare named, string-valued **Inputs** — a PR URL, a log path, anything a run needs to
vary that isn't a secret:

```yaml
inputs:
  - name: prUrl
    required: true
    description: GitHub API URL of the PR diff to review
```

A tool node references one via the whole-string placeholder `${input:NAME}` (same discipline as
`${env:NAME}`, REQ-WORKER-06 — never embedded in a larger string). Values are supplied per invocation —
`wee run --input prUrl=...`, `POST /api/run`'s body, the SDK's `RunOptions.Inputs`, or the UI's Run dialog
— never baked into the workflow file itself, so the same Workflow definition is reused across many
concrete runs. A `Required` input with no supplied value and no `Default` fails the run before any node
dispatches (PRIN-05). See [examples/pr-review-autofix](../../examples/pr-review-autofix/README.md) for the
pattern in the flagship, and [ADR 0011](../adr/0011-workflow-level-inputs.md) for why this is a distinct
mechanism from `${env:NAME}`, not a reuse of it: an Input's resolved value is recorded in the audit trail
(what did this run actually target), while an env value never is (it might be a secret).

Discovering *which* input to use on its own — "list open PRs on this repo and review each" — is still out
of scope until Phase 2's webhook triggers (ROADMAP.md M2.5) give a workflow a reason to be invoked
automatically; Inputs solve *supplying* a value a caller already knows, not *discovering* one.

## Related

- [worker.md](worker.md) — what a Worker-backed node actually is
- [budget.md](budget.md) — the one field every Workflow must declare explicitly (PRIN-05: no silent limits)
- [execution.md](execution.md) — what running a Workflow produces
- [../spec/inputs.md](../spec/inputs.md) — the full REQ-INPUT-* requirements

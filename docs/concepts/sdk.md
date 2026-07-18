# Authoring in Go (the SDK)

Non-normative. The testable rules are [spec/sdk.md](../spec/sdk.md) (`REQ-SDK-*`). Implementation: `sdk/`.

The SDK is a **third door into the same room**. YAML, the visual builder (M1.11), and Go code all compile to
one canonical `domain.Workflow` — a workflow authored any of the three ways content-hashes identically
(REQ-SDK-01, REQ-DEF-02). There is no privileged path and no code-only capability; the SDK just trades a
text file for a typed builder.

## The builder tracks a frontier

`sdk.New(id, version)` returns a builder that accumulates nodes and edges. It carries a **frontier** — the
set of nodes the next step depends on:

| Call | Effect on the graph | Effect on the frontier |
|---|---|---|
| `.Worker(id, w)` / `.Tool(id, tc)` | one node, edges from every frontier node | frontier → `{id}` |
| `.Parallel(specs…)` | each spec becomes a node, edges from every frontier node | frontier → all spec ids |
| `.Merge(id, w, from…)` | one node, edges from `from` (or the whole frontier) | frontier → `{id}` |

So the flagship graph — three parallel reviewers → fixer → test → commit — reads top to bottom:

```go
wf, err := sdk.New("pr-review", "1.0.0").Budget(budget).
    Parallel(
        sdk.Worker("review-security", secReviewer),
        sdk.Worker("review-style", styleReviewer),
        sdk.Worker("review-correctness", correctReviewer),
    ).
    Merge("fix", fixer).                                   // fans the three reviewers in
    Tool("test", testRun).
    Tool("commit", commit).
    Build()
```

The graph node id (`review-security`) and the Worker it references (`secReviewer.ID@Version`) are separate:
the builder records both, so the node references the Worker by `id@version` and the run has the Worker
definition on hand.

## Running and reading results

`(*Workflow).Run(ctx, opts)` assembles the engine over the in-code Workers (providers behind the
`model.Provider` interface, an optional sandboxed tool registry) and starts it, returning an `*Execution`
immediately:

- `exec.Events()` — the live event stream, best-effort (the event log stays the complete record, PRIN-02).
- `exec.Wait()` — blocks for the final `*engine.Result`.
- `sdk.Artifact[T](exec, nodeID)` — decodes a node's stored artifact into a Go type. The artifact was already
  validated against the node's Contract before storage (REQ-WORKER-03), so a worker node's output is
  schema-guaranteed; the generic just puts your type on top.

## What the SDK deliberately does *not* add

The SDK adds no engine capability the CLI or YAML lack — it is a pure client of `core/` (PRIN-02). In
particular it inherits the Phase 1 limits: no external-input seam (a workflow is self-contained), and
`git push` stays out of scope. If it isn't expressible in the canonical `domain.Workflow`, the SDK cannot
express it either — by design.

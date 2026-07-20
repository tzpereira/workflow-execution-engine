# Context Policy

Non-normative. The testable rules are [spec/context-policies.md](../spec/context-policies.md)
(`REQ-CTXPOL-*`). Implementation: `core/policy/resolver.go`; schema at
`schemas/context-policy.schema.json`.

A Context Policy is a Worker's declaration of exactly what it may see — nothing more. It is the mechanism
that turns "context is rationed" (PRIN-05, PRIN-01) from a principle into something the engine mechanically
enforces per node.

## The resolver is a pure function

```go
func Resolve(p domain.ContextPolicy, available []Item) ([]Item, error)
```

`available` is always the node's **direct parents' outputs only** — the engine builds this from the node's
active incoming edges, never from grandparents or the whole graph. A policy narrows that set further; it
never widens it beyond direct parents (REQ-CTXPOL-02: never "full history" by accident).

## The modes

| Mode | Admits |
|---|---|
| `parent-only` (default) / `full` | Every direct parent's output, as-is — today's widest option, still never more than direct parents. |
| `diff-only` | Direct parents whose Artifact **type** is `diff`. |
| `artifacts` | Direct parents whose producing-node **id** is in `params.artifacts` — filters by identity, not type. |
| `none` | Nothing. |
| `summary` | Not implemented — `Resolve` refuses rather than silently admitting full output (a summarization step doesn't exist yet; PRIN honesty over a misleading approximation). |

`diff-only` vs `artifacts` is a real, load-bearing choice, not a style preference: a Tool's output Artifact
type is whatever the Tool declares (`domain.ArtifactJSON` by default — see
`core/engine/tool_executor.go` — unless the Tool implements the optional `ArtifactType()` method, as
`terminal.Tool` does). The generic `http` Tool never implements it, so an HTTP-fetched diff is tagged
`json`, not `diff` — a `diff-only` policy downstream would admit nothing. `examples/pr-review-autofix`'s
three reviewers use `artifacts: [fetch-diff]` for exactly this reason: filtering by the node that produced
it works regardless of how that node's output happened to be tagged.

## Auditable, not just declared (REQ-CTXPOL-03)

Whichever hashes a policy admits are recorded on the Worker's own `WorkerFinished` event
(`payload.contextHashes`) — not the content, the content-addressed hashes. The Inspector (UI) cross-references
those hashes back to whichever upstream node produced them (`ui/src/core/audit.ts`'s `contextHashesFor`/
`nodeIdForHash`), answering "what did this Worker see?" in one click from the audit record alone — no
re-running, no trusting a description of the policy over the recorded fact.

## Related

- [worker.md](worker.md) — the Contract this policy feeds
- [artifact.md](artifact.md) — what a policy actually admits or excludes
- [event.md](event.md) — where the admitted hashes are recorded

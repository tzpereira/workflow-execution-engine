# Contract

Non-normative. The testable rules are [spec/contracts.md](../spec/contracts.md) (`REQ-CONTRACT-*`).
Implementation: `core/domain/contract.go`, `core/engine/worker_executor.go`; schema at
`schemas/contract.schema.json`. For a hands-on guide to writing one, see
[writing-contracts.md](../writing-contracts.md).

A Contract is the enforced specification of a Worker's output — enforced, not merely suggested (PRIN-08). It
is the mechanism that turns "the model said something" into "the model produced a validated artifact."

## Shape

```go
type Contract struct {
	Goal            string
	Rules           []string
	OutputSchema    map[string]any // JSON Schema, draft 2020-12
	SuccessCriteria []string
	MaxRetries      int
}
```

`Goal`/`Rules`/`SuccessCriteria` are prose — they shape what the model is asked to do.
`OutputSchema`/`MaxRetries` are what the engine *enforces*: every response is validated against
`OutputSchema` before it becomes an Artifact; a violation triggers a retry with the validation error (and
only the error — never a re-grown transcript) appended as feedback, up to `MaxRetries` times.

## Enforcement is mechanical, not a suggestion

```
model output → validate against OutputSchema → valid? → Artifact, ContractValidated event
                                              → invalid? → retry with delta feedback (Retry event)
                                                          → still invalid after MaxRetries → ContractViolation, node fails
```

This is REQ-CONTRACT-01/02/03 end to end: a Worker with `outputSchema: {score: number, issues: string[]}`
structurally cannot produce unvalidated output downstream — either the schema holds, or the node fails
explicitly and audibly. There is no silent pass-through.

## Anti-slop by construction (PRIN-08)

Slop needs unbounded space to hide in. A Contract that bounds every field denies it that space:

- **Enums over prose** — `verdict: {enum: [approve, request-changes, comment]}`, not a free-text summary.
- **Bounded arrays** — `issues: {maxItems: 5}`, so "list every possible concern" isn't a valid escape hatch.
- **Bounded strings** — `message: {maxLength: 200}`, so a field can't become a essay.

Every example under `examples/` follows this shape; `examples/examples_test.go`'s
`TestExampleContractsAreTight` locks the flagship reviewer's schema to `maxItems`/`maxLength`/`enum`
markers, so a future edit that loosens it fails CI.

## Verification is a graph pattern, not a hope (REQ-CONTRACT-05)

The strongest verification isn't a bigger Contract on the producer — it's a *second*, independent Worker
judging the producer's Artifact against objective criteria, gating the graph via a conditional edge.
[examples/bug-investigation](../../examples/bug-investigation/README.md) is the reference implementation:
`verify-patch` (cheap, `gpt-4o-mini`) judges `patch`'s (expensive, `gpt-4o`) output before `apply-patch` ever
runs. The producer never gates itself — a separate judge does.

## Related

- [worker.md](worker.md) — the Contract's owner
- [../writing-contracts.md](../writing-contracts.md) — how to design one
- [context-policy.md](context-policy.md) — what the Worker sees while trying to satisfy the Contract

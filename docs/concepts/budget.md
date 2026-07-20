# Budget

Non-normative. The testable rules are [spec/budgets.md](../spec/budgets.md) (`REQ-BUDGET-*`).
Implementation: `core/engine/budget.go`, `core/cost/accounting.go`; schema at `schemas/budget.schema.json`.

A Budget is the declared limit for an Execution: max cost (USD), max tokens, max duration, and max retries
per node. Every Workflow declares one explicitly — there is no implicit "unlimited" by omission (PRIN-05: no
silent overruns). A zero in any single dimension means "no limit *for that dimension*," chosen deliberately
per field, never as a default for the whole Budget.

## Shape

```go
type Budget struct {
	MaxCostUSD        float64
	MaxTokens         int64
	MaxDurationMs     int64
	MaxRetriesPerNode int
}
```

## Enforced before the call, not after the invoice

The engine checks the budget **before** dispatching a node and **before** each model call inside it — never
"we made the call, then noticed we're over." A `BudgetWarning` event fires at 80% of any tracked dimension;
`BudgetExceeded` halts the run deterministically, with a distinct exit code (`2`, see
[cli-reference.md](../cli-reference.md)) so it's scriptable in CI.

## Real cost, not an estimate

`core/cost/accounting.go` prices every model call against the provider's published rates, aggregated per
node and rolled up per Execution — this is the number the Metrics panel, the history table, and
`BudgetExceeded`'s threshold check all read (REQ-METRIC-01). A cache hit is priced at $0 and separately
attributed as *saved* spend (`CacheHit.payload.savedCostUsd`) — cost avoided is not the same fact as cost
never incurred, and the UI keeps the two visually distinct on purpose (an amber "saved" figure, never merged
into the running total).

## Override per run

```sh
wee run workflow.yaml --budget 0.01   # override MaxCostUsd for this run only
```

`--budget` (any value `> 0`) replaces the workflow's own `maxCostUsd` for that run — it can loosen the
ceiling as freely as it can tighten it (`cli/cmd/run.go`'s `budgetFor` has no tighten-only check). It exists
for the common case of temporarily capping a known-expensive run tighter, not as an enforced one-way ratchet
— the workflow file itself is still the durable, versioned source of truth for what a normal run costs.

## Related

- [execution.md](execution.md) — what a Budget bounds
- [../cache-deep-dive.md](../cache-deep-dive.md) — how cache hits become budget headroom, not just a UI number

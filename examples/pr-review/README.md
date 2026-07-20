# pr-review

The smallest complete shape: one diff-scoped reviewer feeding two real tool-backed steps — a Test Runner
(`terminal`) and a Commit (`git`). See the top-level [examples/README.md](../README.md) for what its
Contract bounds and why. This is the minimal skeleton the flagship
([pr-review-autofix](../pr-review-autofix/README.md)) builds out in full — start here to see the
tool-backed-node mechanism on its own, without the parallel fan-out and the auto-fix step.

## Running it

```sh
export OPENAI_API_KEY=sk-...
```

Needs a runner that wires a `terminal` tool instance allowlisting `go`, and a `git` tool instance pointed at
a real repository working directory (a `wee.yaml` in the workspace does this — see
[TUTORIAL.md](../../docs/TUTORIAL.md)). `review` has no incoming edge in this example — the diff it would
read arrives however the running workflow's inputs are wired; this example's point is the tool-backed steps
downstream, not diff-sourcing (see [pr-review-autofix](../pr-review-autofix/README.md) for the `http`-sourced
version).

## Expected cost

One `gpt-4o-mini` call (`reviewer`), nothing else billed — `test` and `commit` are deterministic tool
nodes, never model calls. A typical run costs a fraction of a cent, well inside the workflow's own
`maxCostUsd: 0.05` ceiling. The actual figure for any specific run is real accounting, not an estimate —
see it via `wee inspect <id>` or the UI's Metrics panel (`concepts/budget.md`).

## Found during M1.15's real-repo validation

`commit`'s message used to be `"${review.verdict}: automated review pass"` — but placeholders are
whole-string only (REQ-WORKER-06): a string that isn't *entirely* one placeholder is never substituted at
all, so this would have committed that literal, unresolved text. Fixed by making the message exactly
`"${review.verdict}"`. Found while validating [pr-review-autofix](../pr-review-autofix/README.md) against
real repos — see that README's "Real-repo validation" section.

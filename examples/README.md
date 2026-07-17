# Examples

Demonstration workflow definitions. These are the anti-slop shape templates the
future gallery (M1.14) inherits: **tight contracts by default** (REQ-CONTRACT-04,
PRIN-08). Each is schema-valid (`examples_test.go` loads and validates every file
against `schemas/`) so the examples can never drift from the domain model.

## `pr-review/`

A diff-scoped reviewer with a tight output contract:

- **[`reviewer.worker.yaml`](pr-review/reviewer.worker.yaml)** — a `Worker` whose
  `contract.outputSchema` bounds every field it may emit: `enum` verdict and
  severities (not free prose), a `0..100` integer score, at most five issues
  (`maxItems`), each message capped at 200 chars (`maxLength`). Its
  `contextPolicy: diff-only` means it sees only the diff — never a sibling's
  output (REQ-CTXPOL-01).
- **[`workflow.yaml`](pr-review/workflow.yaml)** — a single-node workflow placing
  that reviewer, with an explicit, small budget (no silent overruns, PRIN-05).

Why tight? Slop needs unbounded space; a contract denies it. A reviewer that can
return "a paragraph of thoughts" will; one that must return
`{verdict, score, issues[≤5]}` cannot (PRIN-08).

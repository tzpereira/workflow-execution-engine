# Examples

Demonstration workflow definitions. These are the anti-slop shape templates the
future gallery (M1.14) inherits: **tight contracts by default** (REQ-CONTRACT-04,
PRIN-08). Each is schema-valid (`examples_test.go` loads and validates every file
against `schemas/`) so the examples can never drift from the domain model.

## `pr-review/`

A diff-scoped reviewer feeding real tool-backed steps:

- **[`reviewer.worker.yaml`](pr-review/reviewer.worker.yaml)** — a `Worker` whose
  `contract.outputSchema` bounds every field it may emit: `enum` verdict and
  severities (not free prose), a `0..100` integer score, at most five issues
  (`maxItems`), each message capped at 200 chars (`maxLength`). Its
  `contextPolicy: diff-only` means it sees only the diff — never a sibling's
  output (REQ-CTXPOL-01).
- **[`workflow.yaml`](pr-review/workflow.yaml)** — the reviewer feeding a Test
  Runner (`terminal` tool) and a Commit (`git` tool) — deterministic,
  tool-backed nodes (ADR 0008, M1.6a): no LLM ever decides their input. Commit's
  message interpolates the reviewer's verdict via the whole-string placeholder
  `${review.verdict}` (REQ-WORKER-06). Explicit, small budget throughout (no
  silent overruns, PRIN-05).

Why tight contracts? Slop needs unbounded space; a contract denies it. A
reviewer that can return "a paragraph of thoughts" will; one that must return
`{verdict, score, issues[≤5]}` cannot (PRIN-08).

**Running this for real** needs the runner to wire actual tool instances — a
`terminal` tool whose command allowlist includes `"go"`, and a `git` tool
pointed at a real repository working directory (`core/tool/terminal`,
`core/tool/git`) — plus a real model provider for the reviewer (`core/model`).
Schema and graph validity are covered by `examples_test.go`; the underlying
tool-backed-node mechanism this workflow exercises is covered end-to-end by
`engine.TestMixedGraphRunsThroughRealScheduler` (`core/engine`). Running the
full graph against a real repo (not just validating it) is M1.15's flagship-demo
task, not this example's.

## `github-pr-review/`

Demonstrates remote GitHub access with **zero new tool code** — the generic
`http` tool (M1.5), a domain allowlist entry for `api.github.com`, and the
`${env:...}` secret-reference placeholder (M1.6a) are all it takes. See its own
[README](github-pr-review/README.md) for the documented, deliberately-unsolved
v1 gaps (diff truncation on very large PRs, no rate-limit/pagination handling).

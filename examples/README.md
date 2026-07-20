# Examples

Demonstration workflow definitions with **tight contracts by default**
(REQ-CONTRACT-04, PRIN-08). Each is schema-valid (`examples_test.go` loads and
validates every file against `schemas/`) so the examples cannot drift from the
domain model.

The published UI gallery deliberately contains only read-only workflows that
are useful on first run: `pr-review`, `test-generator`, and `change-risk`.
Examples that write files or use Git remain available as source references, but
will not return to the beginner gallery until the persisted human-approval gate
in M1.16 is delivered.

## `pr-review/`

The fast, read-only product path: an allowlisted HTTP node fetches a public
GitHub PR diff, then one `gpt-4o-mini` Worker returns a bounded verdict. It needs
no clone; a GitHub token is optional but useful when the anonymous shared-IP
quota is exhausted. With no filesystem or Git node, review cannot silently
become a write, branch, or commit operation.

- **[`reviewer.worker.yaml`](pr-review/reviewer.worker.yaml)** — one combined
  correctness/security review whose `contract.outputSchema` bounds every field:
  enum verdict and severities, a `0..100` score, at most five issues, and
  200-character messages. Output is capped at 700 tokens.
- **[`workflow.yaml`](pr-review/workflow.yaml)** — declares `prUrl`, fetches the
  diff from `api.github.com`, and calls only that reviewer. One transient retry
  and a 90-second wall-clock limit keep failure bounded.

Why tight contracts? Slop needs unbounded space; a contract denies it. A
reviewer that can return "a paragraph of thoughts" will; one that must return
`{verdict, score, issues[≤5]}` cannot (PRIN-08).

**Running this for real** only needs `OPENAI_API_KEY`; the sibling `wee.yaml`
already permits `api.github.com`. Use `pr-review-autofix` separately when a
human deliberately wants fix generation and local tool actions.

## `test-generator/`

A three-step, read-only workflow that fetches a public source file, creates a
bounded test plan, and produces a complete syntax-highlighted test file. See
its [README](test-generator/README.md) for the accepted URL form and cost shape.

## `change-risk/`

A three-step, read-only workflow that fetches a public GitHub comparison,
extracts factual change signals, and renders a scored risk report as dimension
charts, findings, and actions. See its [README](change-risk/README.md).

## `github-pr-review/`

Demonstrates remote GitHub access with **zero new tool code** — the generic
`http` tool (M1.5), a domain allowlist entry for `api.github.com`, and the
`${env:...}` secret-reference placeholder (M1.6a) are all it takes. See its own
[README](github-pr-review/README.md) for the documented, deliberately-unsolved
v1 gaps (diff truncation on very large PRs, no rate-limit/pagination handling).

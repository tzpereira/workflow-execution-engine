# architecture-review

Secondary demo ([VISION.md](../../docs/VISION.md)): `spec -> {backend, frontend, security, performance} ->
merge`. The same parallel-fan-out-then-merge shape as the flagship
([pr-review-autofix](../pr-review-autofix/README.md)), applied to a design spec instead of a PR diff.

```
read-spec -+-> backend        -+
           +-> frontend         |
           +-> security         +-> merge
           +-> performance     -+
```

Four independent reviewers run in parallel, each scoped to see only the spec (`contextPolicy: {mode:
artifacts, params: {artifacts: [read-spec]}}`) — a slow or opinionated sibling can neither bloat nor bias
another (REQ-CTXPOL-01) — feeding a `merge` Worker (`gpt-4o`, the only step that needs to hold all four
views at once) that synthesizes them into one verdict.

## Running it

```sh
export OPENAI_API_KEY=sk-...
export ARCH_SPEC_PATH=/path/to/spec.md
```

`read-spec` reads `ARCH_SPEC_PATH` via the `filesystem` tool — same env-var-sourced-input pattern as the
other secondary demos, since Phase 1 has no workflow-level "inputs" concept. No terminal/git tools are
needed here — this workflow never touches a working tree, only reads one file.

## Expected cost

Five LLM Workers: four cheap `gpt-4o-mini` reviewers running in parallel, plus one `gpt-4o` merge call. A
typical run costs a few cents, comfortably inside the workflow's own `maxCostUsd: 0.30` ceiling. The actual
figure for any specific run is real accounting, not an estimate — see it via `wee inspect <id>` or the UI's
Metrics panel ([concepts/budget.md](../../docs/concepts/budget.md)).

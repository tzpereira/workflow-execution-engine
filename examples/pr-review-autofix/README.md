# pr-review-autofix

The flagship demo ([VISION.md](../../docs/VISION.md) "Pull Request Review & Auto-Fix") — every
differentiator the project claims, in one graph:

```
fetch-diff
  +-- reviewer-a        (style & correctness)
  +-- reviewer-b        (adversarial — assumes the diff is wrong)
  +-- security-reviewer (vulnerabilities)      <- all three in parallel
        v
      fixer        (reads the diff + all three reviews)
        v (conditional: shouldFix == true)
      apply-fix    (tool: filesystem, writes fixer's corrected file)
        v
      test          (tool: terminal)
        v
      stage         (tool: git add)
        v
      commit        (tool: git commit)
```

Three independent reviewers, each scoped to see only the diff (`contextPolicy: {mode: artifacts,
params: {artifacts: [fetch-diff]}}` — see [concepts/context-policy.md](../../docs/concepts/context-policy.md)
for why `artifacts` mode, not `diff-only`, is what actually works here); a Fixer gated by a conditional edge
on its own `shouldFix` field; real tool-backed apply/test/stage/commit steps; node-cache reuse across
re-runs.

## Running it

Requires:

- `prUrl` — a declared workflow input ([concepts/workflow.md](../../docs/concepts/workflow.md),
  REQ-INPUT-01): the specific PR diff URL this run reviews. Supply it with
  `wee run workflow.yaml --input prUrl=https://api.github.com/repos/OWNER/REPO/pulls/N`, or pick it in the
  UI's Run dialog after importing the template — either way it's recorded in the run's audit trail.
- `GITHUB_AUTH_HEADER` — an env var (`REQ-WORKER-06`), since a credential is deployment config, not a run
  parameter, and is never recorded.
- A `wee.yaml` allowlisting the terminal command this repo's tests run with (`go` by default here) and
  pointing the workspace root at a real git checkout of the target repo.
- `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`, per each Worker's `model.provider`) for the four LLM Workers.

Per-repo tuning (test command, timeouts, budget) is expected — this bundle's defaults are a starting point,
not a one-size-fits-all config.

## Expected cost

Four LLM Workers per run: three `gpt-4o-mini` reviewers (parallel, cheap) plus one `gpt-4o` fixer (the
expensive call, since it has to read the diff and all three reviews and produce a working patch). The
`gpt-4o` fixer dominates the total — a typical run costs low tens of cents, comfortably inside the
workflow's own `maxCostUsd: 0.50` ceiling; a run where `shouldFix` comes back false skips `apply-fix`
onward and costs less still. The actual figure for any specific run is real accounting, not an estimate —
see it via `wee inspect <id>` or the UI's Metrics panel ([concepts/budget.md](../../docs/concepts/budget.md)).

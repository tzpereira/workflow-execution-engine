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
        v
      verify-fix   (REQ-CONTRACT-05 — a separate, cheap judge; see below)
        v (conditional: approved == true)
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
for why `artifacts` mode, not `diff-only`, is what actually works here); a Fixer whose own output is judged
by a separate `verify-fix` Worker before anything touches a file; real tool-backed apply/test/stage/commit
steps; node-cache reuse across re-runs.

## Running it

Requires:

- `prUrl` — a declared workflow input ([concepts/workflow.md](../../docs/concepts/workflow.md),
  REQ-INPUT-01): the specific PR diff URL this run reviews. Supply it with
  `wee run workflow.yaml --input prUrl=https://api.github.com/repos/OWNER/REPO/pulls/N`, or pick it in the
  UI's Run dialog after importing the template — either way it's recorded in the run's audit trail.
- `GITHUB_AUTH_HEADER` — an env var (`REQ-WORKER-06`), since a credential is deployment config, not a run
  parameter, and is never recorded. An empty value works fine against a public repo's diff for a quick try
  (GitHub allows unauthenticated reads at a lower rate limit); a real token is needed for sustained use.
- A `wee.yaml` allowlisting the terminal command this repo's tests/build run with (`go` by default here)
  and pointing the workspace root at a real git checkout of the target repo.
- `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`, per each Worker's `model.provider`) for the five LLM Workers.

Per-repo tuning (test command, timeouts, budget) is expected — this bundle's defaults are a starting point,
not a one-size-fits-all config. See "Real-repo validation" below for what tuning three actual repos needed.

## Expected cost

Five LLM Workers per run: three `gpt-4o-mini` reviewers (parallel, cheap), one `gpt-4o` fixer (the
expensive call), and one `gpt-4o-mini` verifier. A typical run costs roughly half a cent to a couple of
cents — see the real figures below — comfortably inside the workflow's own `maxCostUsd: 0.50` ceiling; a
run where `verify-fix` rejects the fix skips `apply-fix` onward and costs less still. The actual figure for
any specific run is real accounting, not an estimate — see it via `wee inspect <id>` or the UI's Metrics
panel ([concepts/budget.md](../../docs/concepts/budget.md)).

## Real-repo validation (M1.15)

Run for real against three public repos of different sizes — [google/uuid](https://github.com/google/uuid)
(small), [spf13/cobra](https://github.com/spf13/cobra) (medium), and
[prometheus/prometheus](https://github.com/prometheus/prometheus) (large) — each against a real, recent
merged PR, in a disposable local clone (nothing pushed anywhere). This is real accounting, not an estimate:
runs cost $0.0050–$0.0110 each, all inside a tightened `--budget 0.20` cap.

**Bugs found and fixed as a direct result** (none of these were caught by schema/graph validation or unit
tests alone — they only surfaced running the graph against a real model and a real repo):

- `stage`/`commit` referenced `${fixer.path}`/`${fixer.commitMessage}` without a direct edge from `fixer` —
  context resolution only ever sees direct parents, so both placeholders failed to resolve. Fixed by adding
  `fixer -> stage` and `fixer -> commit` edges alongside the existing ordering edges. The same missing-edge
  bug existed in [bug-investigation](../bug-investigation/README.md)'s `apply-patch` (fixed there too).
- [pr-review](../pr-review/README.md)'s commit message embedded a placeholder in a larger string
  (`"${review.verdict}: automated review pass"`) — placeholders are whole-string only (REQ-WORKER-06); a
  partial match is never substituted and is committed as literal, unresolved text. Fixed by making the
  message exactly `"${review.verdict}"`.
- Large repos need per-repo tuning to stay within a reasonable time/cost budget: prometheus's `test` node
  was scoped from `go test ./...` (the whole suite) to `go build ./cmd/prometheus/...` (a fast, real
  compile check relevant to the PR under review), with `wee.yaml`'s terminal `timeoutMs` and the workflow's
  own `maxDurationMs` both raised.

**A real safety gap found, and REQ-CONTRACT-05 applied to close it:** the first validation pass (before
`verify-fix` existed) found `fixer` occasionally emits a raw diff fragment (`diff --git a/...`, `+++`,
`@@` hunk headers) as its `content` field instead of the actual corrected file — a shape no `outputSchema`
alone can reject (`content` is just `{type: string}`; a diff fragment is still a syntactically valid
string). Concretely, this once **overwrote prometheus's `AGENTS.md` with diff syntax** instead of the real
corrected file, in a disposable local clone — a genuine, if contained, failure. `verify-fix` (mirroring
[bug-investigation](../bug-investigation/README.md)'s `verify-patch` pattern) was added specifically to
catch this: a separate, cheap Worker judges `fixer`'s own output before `apply-fix` ever runs.

**Disclosed, current limitation:** with `gpt-4o` at `temperature: 0`, `fixer` produces a diff-fragment
`content` far more often than a real full-file rewrite when it's shown the diff as its own context — likely
the diff's own formatting biasing the model's output shape. Across repeated runs against all three
validation repos, `verify-fix` correctly rejected this every time (`"content is a diff fragment, not a full
file."`), so **no file was ever corrupted after `verify-fix` was added** — but it also means the auto-fix
step frequently doesn't reach an applied fix at all in its current prompt form. The review portion (three
reviewers + the verdict) is reliable; the auto-*fix* portion needs further prompt iteration (a different
model, restructuring how the diff is presented as context, or few-shot examples of correct full-file
output) to be reliably useful, not just safe. This is exactly what REQ-CONTRACT-05's verifier-node pattern
is *for*: a producer's unreliability degrades to "nothing happens," never to "something wrong got applied."

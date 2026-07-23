# pr-review-autofix

The flagship demo ([VISION.md](../../docs/VISION.md) "Pull Request Review & Auto-Fix") — every
differentiator the project claims, in one graph:

```text
fetch-pr
fetch-diff
  +-- reviewer-a        (style & correctness)
  +-- reviewer-b        (adversarial — assumes the diff is wrong)
  +-- security-reviewer (vulnerabilities)      <- all three in parallel
  +-- locate-file       (extracts the path and raw base-file URL)
        v
      read-original (tool: http read — the real base file locate-file named)
        v
      fixer        (reads the diff + all three reviews + the real original file)
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
for why `artifacts` mode, not `diff-only`, is what actually works here); a `locate-file` Worker + a
`read-original` HTTP read that hand the Fixer the real, complete original file from the PR base commit —
not just the diff — to base its rewrite on (see "Disclosed, current limitation" below for the failure this
closes); a Fixer
whose own output is judged by a separate `verify-fix` Worker before anything touches a file; real
tool-backed apply/test/stage/commit steps; node-cache reuse across re-runs.

## Five-minute public demo path (M2.12)

This is the repeatable product walkthrough for the packaged template. Use a
**disposable clone** as `WEE_WORKSPACE_ROOT`; the workflow can write, test,
stage, and commit after explicit approvals.

1. Start `wee serve` with the built UI and `--templates examples/templates`,
   with `WEE_WORKSPACE_ROOT` pointing at the disposable target checkout.
2. Open **Templates** and choose `pr-review-autofix`. Before import, confirm the
   card says **write-capable**, requires the `openai` model connection, declares
   the required `prUrl` input, and lists filesystem/Git/HTTP/terminal tools.
3. In **Settings → Model providers**, add or update the `openai` connection and
   set its key. In the Run dialog, supply a public GitHub PR API URL such as
   `https://api.github.com/repos/OWNER/REPO/pulls/N`.
4. On the imported canvas, point out the published split: **6 model** nodes and
   **7 deterministic** nodes. Select one of each. The Inspector shows the
   Worker's name/version/description and resolved `provider / model-id`, or an
   explicit **no model** plus the recorded Tool name/version.
5. Run. Review/fix proposal generation may proceed without workspace mutation.
   If `verify-fix` approves a proposed correction, execution pauses before
   `apply-fix`; inspect the formatted change, affected path, command/API
   preview, and remaining budget. Nothing mutating has run at this point.
6. Reject to demonstrate the safe stop, or approve only in the disposable
   clone. Later mutating steps (`test`, `stage`, `commit`) remain independently
   checkpointed; approval of one operation never approves another.

What this demo proves now: the real gallery bundle imports through the canonical
workflow path; model/deterministic identity is visible and tied to the frozen
execution snapshot; and write-capable work pauses at persistent, explicit
approval checkpoints. It does **not** prove that a model-generated correction
is correct, that every PR is single-file/supported, or that the post-
`read-original` workflow has completed the new public-repository proof. That
real, recorded run is M2.13; the historical M1.15 runs below predate the
`read-original` correction and are disclosed as such.

## Inspiration

The implement → adversarial-review → fix → verify → commit shape here is a deliberate nod to the
[Zig-to-Rust port of Bun](https://bun.com/blog/bun-in-rust) (Jarred Sumner + Claude, July 2026), which ran a
similar Write → Attack → Fix → Commit loop across many parallel Claude Code workflows. There the
orchestration lived in a conversation and was thrown away once the port landed. WEE's bet is that the loop is
the durable part: the same graph, kept as a versioned, budgeted, cached, replayable definition instead of
reconstructed by hand each time.

## Running it

Requires:

- `prUrl` — a declared workflow input ([concepts/workflow.md](../../docs/concepts/workflow.md),
  REQ-INPUT-01): the specific PR diff URL this run reviews. Supply it with
  `wee run workflow.yaml --input prUrl=https://api.github.com/repos/OWNER/REPO/pulls/N`, or pick it in the
  UI's Run dialog after importing the template — either way it's recorded in the run's audit trail.
- Public GitHub PR reads are anonymous by default. If the shared-IP quota is exhausted, set
  `GITHUB_AUTH_HEADER` to `Bearer <token>` in Settings; it is sent but never recorded.
- A `wee.yaml` allowlisting GitHub hosts plus the terminal command this repo's tests/build run with (`go`
  by default here). The workspace root is only used by the local tail (`apply-fix`/`test`/`stage`/`commit`);
  point it at a real git checkout before allowing those nodes to run.
- `OPENAI_API_KEY` (or `ANTHROPIC_API_KEY`, per each Worker's `model.provider`) for the six LLM Workers.

Per-repo tuning (test command, timeouts, budget) is expected — this bundle's defaults are a starting point,
not a one-size-fits-all config. See "Real-repo validation" below for what tuning three actual repos needed.

## Expected cost

Six LLM Workers per run: three `gpt-4o-mini` reviewers (parallel, cheap), one `gpt-4o-mini` `locate-file`
(cheap — path + raw URL extraction), one `gpt-4o` fixer (the expensive call), and one `gpt-4o-mini` verifier.
A typical run costs roughly half a cent to a couple of cents — see the real figures below — comfortably
inside the workflow's own `maxCostUsd: 0.50` ceiling; a run where `verify-fix` rejects the fix skips
`apply-fix` onward and costs less still. The actual figure for any specific run is real accounting, not an
estimate — see it via `wee inspect <id>` or the UI's Metrics panel
([concepts/budget.md](../../docs/concepts/budget.md)).

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

**Root cause found and fixed:** with `gpt-4o` at `temperature: 0`, `fixer` produced a diff-fragment
`content` far more often than a real full-file rewrite when it's shown the diff as its own context. The
actual cause: `fixer` never had the real file to begin with — only the diff, which for anything but a
trivially short file shows nowhere near every unchanged line. Asked for "the complete corrected file" with
no source for most of that file's own content, the model had little choice but to echo back something
diff-shaped. Across repeated runs against all three validation repos, `verify-fix` correctly rejected this
every time (`"content is a diff fragment, not a full file."`), so **no file was ever corrupted** — but it
also meant the auto-fix step frequently never reached an applied fix. Fixed by adding `locate-file` (a
cheap Worker that extracts the modified path from the diff and builds the raw GitHub URL for the PR base
file) and `read-original` (an `http` read of that real file) upstream of `fixer`, so `fixer` now edits the
actual file content instead of reconstructing it from a partial diff — and `verify-fix` now also sees
`read-original`, so it can reject a `content` whose
unrelated lines diverge from the real file, not just pattern-match diff syntax. **Not yet re-validated
against a real repo** (the original three validation runs predate this fix) — the review portion (three
reviewers + the verdict) remains independently reliable regardless. This is exactly what
REQ-CONTRACT-05's verifier-node pattern is *for*: a producer's unreliability degrades to "nothing happens,"
never to "something wrong got applied."

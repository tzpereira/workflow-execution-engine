# refactor-plan

A read-only, two-step workflow — the **local git-diff** change-source shape
(M2.3): fetch the workspace's own `git diff`, then propose a bounded refactor
plan for exactly the code it touches. Same two-node shape as `pr-review`
(fetch-node → one bounded-verdict Worker); node 1 swaps `http` + GitHub for
`git diff` + local, proving the change source is workflow configuration, not
Core.

Point `wee.yaml`'s `workspaceRoot` at a local git checkout with uncommitted
changes (`WEE_WORKSPACE_ROOT`), or run this from inside one:

```sh
wee run examples/refactor-plan/workflow.yaml
```

No GitHub account, PR URL, or network access is needed — `git diff` never
reaches a remote (the `git` tool has no push or clone, workspace-scoped only)
and reads the working tree directly.

Only `OPENAI_API_KEY` is required. Budget is capped at $0.03 / 30k tokens / 90
seconds — the same shape as `pr-review`. Re-running against an unchanged diff
reuses the cached plan artifact for free; changing the diff produces a fresh
one. Because `git diff` is read-only (no `add`/`commit`/`branch` anywhere in
this graph), it never writes files, stages changes, or commits — nothing here
requires the M2.5 human-approval gate.

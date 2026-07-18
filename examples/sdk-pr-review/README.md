# sdk-pr-review

The flagship PR-review demo authored via the **Go SDK** (`sdk/`), not YAML — the same graph
[docs/VISION.md](../../docs/VISION.md) describes: three diff-scoped reviewers run in parallel, a fixer
merges their findings, then a test run and a commit.

It exists to prove two things:

- **REQ-SDK-03 — small API.** The whole program is under 100 lines (`main.go` is 82), enforced by
  `examples.TestSDKFlagshipUnder100Lines`.
- **REQ-SDK-01 — no privileged path.** A workflow built with the SDK content-hashes identically to the
  equivalent hand-written YAML (`sdk.TestSDKAndYAMLHashIdentical`). The SDK is a third door into the same
  room, not a shortcut around the canonical format.

## Running it

```
export OPENAI_API_KEY=...        # the reviewers and fixer are LLM Workers
go run ./examples/sdk-pr-review
```

The `test` node runs `go test ./...` and the `commit` node makes a local git commit — both are deterministic
tool nodes (no model decides their input, ADR 0006). `git push` stays out of scope (Phase 1 never reaches a
remote), so the terminal state is "committed locally, tests green."

## v1 gaps (shared with the YAML flagship)

The reviewers have no diff to read yet — there is no external-input seam in Phase 1 (a workflow is
self-contained; see the `--input` note in [EXECUTION.md](../../docs/EXECUTION.md) M1.9). A complete version
feeds the diff in through a leading tool node (e.g. `git diff`) once that wiring exists. This demo's job is
to show the *authoring* shape and prove the hash-equality and line-count guarantees, which it does.

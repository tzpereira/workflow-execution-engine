# Examples

Demonstration workflow definitions with **tight contracts by default**
(REQ-CONTRACT-04, PRIN-08). Each is schema-valid (`examples_test.go` loads and
validates every file against `schemas/`) so the examples cannot drift from the
domain model.

The published UI gallery deliberately contains only read-only workflows that
are useful on first run: `pr-review`, `test-generator`, `change-risk`,
`refactor-plan`, `release-notes`, and `dependency-audit`. Examples that write
files or use Git mutations remain available as source references, now guarded
by M2.5's persisted human-approval checkpoints, but they stay out of the
beginner gallery until the product has a fuller guided mutation flow.
Read-only-ness is a structural guarantee, not a naming convention:
`core/registry.DeriveTemplateFacts` classifies every published
`.tar`, and `examples_test.go`'s `TestPublishedTemplateCatalogIsReadOnly`
fails CI if a write-capable workflow is ever added to `templates/`.

Between them, the gallery now demonstrates four distinct change-source
shapes (M2.3, VISION's "GitHub is only one source adapter, not a product
boundary"): a GitHub PR/compare/file fetch over `api.github.com`
(`pr-review`, `change-risk`, `test-generator`), a **local `git diff`**
that never reaches a remote (`refactor-plan`), a **generic public patch/diff
URL** with no forge-specific code (`release-notes`), and a **local
filesystem read** with no network at all (`dependency-audit`).

The remaining two shapes M2.3's task list names — a GitLab merge request and
a Bitbucket pull request — are not built as separate templates here, to avoid
depending on a live third-party API this repo can't continuously verify
(PRIN-07). They reduce to the exact same mechanism `pr-review` already
proves: GitLab exposes a merge request's diff at
`.../merge_requests/<iid>.diff` and Bitbucket exposes one at
`.../pullrequests/{id}/diff` — both a plain `http` `GET`, optionally paired
with a `urlRewrite` rule the same way `pr-review` normalizes a browser PR URL
into GitHub's API form. Point `release-notes` at either (add the host to its
`wee.yaml`'s `http.allow`) and it works unmodified — no Core change, because
the change source was always workflow configuration, never Core's.

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
- **[`workflow.yaml`](pr-review/workflow.yaml)** — declares `prUrl`, accepts
  either a browser PR URL or API URL, fetches the diff from `api.github.com`, and
  calls only that reviewer. One transient retry and a 90-second wall-clock limit
  keep failure bounded.

Why tight contracts? Slop needs unbounded space; a contract denies it. A
reviewer that can return "a paragraph of thoughts" will; one that must return
`{verdict, score, issues[≤5]}` cannot (PRIN-08).

**Running this for real** only needs `OPENAI_API_KEY`; the sibling `wee.yaml`
already permits the normalized `api.github.com` request. Use
`pr-review-autofix` separately when a human deliberately wants fix generation
and local tool actions; its README notes the Bun Zig-to-Rust port whose
Write → Attack → Fix → Commit loop inspired that graph.

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

## `refactor-plan/`

The **local `git diff`** change-source shape (M2.3). Same two-node shape as
`pr-review`, but node 1 is a read-only `git diff` instead of `http` +
GitHub — proof the change source is workflow configuration, not Core. Needs
no network access and no forge account; point it at any local git checkout
with uncommitted changes. See its [README](refactor-plan/README.md).

## `release-notes/`

The **generic public patch/diff URL** change-source shape (M2.3): a plain
`http` `GET` with no `urlRewrite` and no GitHub-specific media type, unlike
`pr-review`/`change-risk`'s `api.github.com` JSON calls — works with any host
`wee.yaml` allows. See its [README](release-notes/README.md).

## `dependency-audit/`

The **local file** change-source shape (M2.3): a read-only filesystem read
of a dependency manifest, no network at all. Deliberately does not call a
live vulnerability-lookup API — see its [README](dependency-audit/README.md)
for that disclosed scope boundary.

## Self-hosted template run

With Docker Compose, open `http://localhost:7676`, click **Templates**, import one of the read-only
templates, and run it. The Compose volumes keep imported workflows, history, artifacts, and cache after:

```sh
docker compose down
docker compose up
```

See [docs/self-hosted.md](../docs/self-hosted.md) for backup/restore and upgrade steps.

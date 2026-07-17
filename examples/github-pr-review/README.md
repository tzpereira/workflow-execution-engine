# github-pr-review

Demonstrates remote GitHub access with **zero new tool code**: the generic `http` tool (M1.5), a domain
allowlist entry for `api.github.com`, and the `${env:...}` secret-reference placeholder (M1.6a, ADR 0008)
are all it takes to fetch a PR's diff and post a review comment.

## What it does

Two tool-backed nodes (`fetch-pr-diff`, `post-review`), each a plain `http` call — no LLM decides either
call's input (ADR 0006). `fetch-pr-diff` gets the diff in GitHub's diff media type; `post-review` posts a
fixed placeholder comment. See `workflow.yaml`'s header comment for exactly why a real review body has to
be pre-composed by an LLM Worker's Contract output rather than built inside the tool node itself — a
direct consequence of the whole-string-only placeholder design (REQ-WORKER-06).

## Running it

Set these environment variables before invoking the workflow — each is one **complete, precomposed**
value, because tool-input placeholders are whole-string only (never embedded in a larger string):

| Variable | Example value |
|---|---|
| `GH_PR_URL` | `https://api.github.com/repos/acme/widgets/pulls/42` |
| `GH_REVIEW_URL` | `https://api.github.com/repos/acme/widgets/pulls/42/reviews` |
| `GITHUB_AUTH_HEADER` | `Bearer ghp_xxxxxxxxxxxxxxxxxxxx` |

A CI job already has the owner/repo/PR-number available (e.g. GitHub Actions' `github.repository` /
`github.event.number` context) and can compose these three values before invoking `wee run` — that
composition is the CI job's responsibility, not this workflow's.

The `http` tool instance a runner wires for this workflow must allowlist `api.github.com`
(`core/tool/http.New([]string{"api.github.com"}, nil)`).

## Documented v1 gaps (not solved here)

- **Diff truncation on very large PRs.** GitHub's diff media type can be truncated past an undocumented
  size threshold; the `http` tool caps response reads at 8 MiB (generous, not infinite). A genuinely huge
  PR's diff could still arrive shorter than expected, silently — no error is surfaced either way.
- **No rate-limit or pagination handling.** GitHub allows 5000 authenticated requests/hour; `http.Tool`
  doesn't distinguish a 429/403 rate-limit response from any other HTTP status. A non-issue for this
  demo's single GET + single POST, a real gap for sustained, repeated use.
- **No real review body.** `post-review`'s comment is a fixed placeholder string, not an LLM-authored
  review — see `workflow.yaml`'s header comment for the pattern a full version would follow (an LLM
  Worker pre-composing the complete GitHub JSON body as one output field, referenced whole).

Building the complete pattern out (a real reviewer producing the body, wired into the flagship graph) is
M1.14/M1.15's task, not this milestone's — this example's job is proving the access mechanism needs no new
tool code, which it does.

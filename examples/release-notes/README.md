# release-notes

A read-only, two-step workflow — the **generic public patch/diff URL**
change-source shape (M2.3): fetch any publicly reachable raw diff/patch as
plain text, then summarize it into short, categorized, user-facing release
notes. Unlike `pr-review`/`change-risk`, there is no `urlRewrite` and no
GitHub API media type — this is a plain `GET`, so it works with any host
`wee.yaml` allows.

Use `patchUrl` with any URL that serves a raw diff/patch as plain text. GitHub
itself supports this on any commit, PR, or compare page by appending `.diff`
— no API call, no token:

```text
https://github.com/OWNER/REPO/commit/SHA.diff
```

```sh
wee run examples/release-notes/workflow.yaml \
  --input patchUrl=https://github.com/octocat/Hello-World/commit/7fd1a60b01f91b314f59955a4e4d4e80d8edf11.diff
```

A GitLab merge request's `.diff` URL, a Bitbucket pull request's diff
endpoint, or any hosted `.patch` file works the same way — add that host to
`wee.yaml`'s `http.allow` (only `github.com` is allowed by default here) and
pass its URL as `patchUrl`. The workflow itself carries no forge-specific
knowledge; only the allowlist and the URL change.

Only `OPENAI_API_KEY` is required. Budget is capped at $0.03 / 30k tokens / 90
seconds. Re-running against an unchanged `patchUrl` reuses the cached notes
artifact for free; the HTTP fetch itself is not cached and always refreshes.
This workflow never writes files, creates branches, or commits.

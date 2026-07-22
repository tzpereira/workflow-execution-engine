# pr-review

The fast, read-only default for reviewing a public GitHub PR. It fetches the
diff remotely and makes one bounded `gpt-4o-mini` call. No clone or GitHub token
is required, and this workflow never writes files, creates branches, commits, or
opens pull requests.

Use the normal browser PR URL as `prUrl`:

```text
https://github.com/OWNER/REPO/pull/N
```

API URLs like `https://api.github.com/repos/OWNER/REPO/pulls/N` also work.
In the UI, import the `pr-review` template, click Run, and paste that URL. From
the CLI:

```sh
wee run examples/pr-review/workflow.yaml \
  --input prUrl=https://github.com/bitcoin/bitcoin/pull/35752
```

Only `OPENAI_API_KEY` is required. Public GitHub requests work anonymously while
the shared IP has quota; setting `GITHUB_AUTH_HEADER` to `Bearer <token>` raises
that limit and the workflow sends it without recording the credential. The
workflow normalizes the PR URL to GitHub's diff API, fails fast on non-2xx HTTP
responses, caps output at 700 tokens, allows one transient retry, and stops
after 90 seconds. Budget is capped at $0.03 / 30k tokens overall. Re-running
an unchanged PR reuses the model artifact from cache; the HTTP fetch itself
is free and intentionally refreshed.

`pr-review-autofix` remains the advanced workflow. Treat it as a separate,
human-selected step after reviewing this result; local writes and Git actions
should not be the default first-run experience.

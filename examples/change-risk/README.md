# change-risk

A read-only three-step workflow for a public GitHub compare: fetch the change,
extract factual signals, then produce a scored risk report. The final artifact
renders as dimension bars, findings, and actions in the UI.

Use `compareUrl` in this form:

```text
https://api.github.com/repos/OWNER/REPO/compare/BASE...HEAD
```

Requires `OPENAI_API_KEY`. `GITHUB_AUTH_HEADER` is optional and raises GitHub's
shared-IP rate limit when configured in Settings.

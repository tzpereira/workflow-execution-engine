# dependency-audit

A read-only, two-step workflow — the **local file** change-source shape
(M2.3): read a dependency manifest from the local workspace and flag entries
worth a closer look. No network call anywhere in this graph — the only
non-GitHub, non-HTTP shape in this gallery.

Point `wee.yaml`'s `workspaceRoot` at the repository to audit
(`WEE_WORKSPACE_ROOT`), then run with the manifest's path relative to that
root:

```sh
wee run examples/dependency-audit/workflow.yaml --input manifestPath=go.mod
```

Works the same way for `package.json`, `requirements.txt`, or any other
manifest — the workflow only reads text and hands it to the model, nothing
manifest-format-specific is hardcoded.

**Deliberate scope boundary:** this template does **not** call a live
vulnerability-lookup API. Wiring one in — an allowlisted, no-auth batch-query
endpoint such as OSV.dev — would give the audit real signal instead of
training-data recall, and is a natural next step; it's left undone here
because baking in an unverified external API's request/response shape is
exactly the kind of dependency risk this project's own vetting discipline
(PRIN-07) cautions against. The Worker's contract enforces the honest
version of this limitation instead: it must never state a CVE, a specific
vulnerable version, or an advisory it wasn't actually given.

Only `OPENAI_API_KEY` is required. Budget is capped at $0.03 / 30k tokens / 90
seconds. Re-running against an unchanged manifest reuses the cached audit
artifact for free. This workflow never writes files, creates branches, or
commits.

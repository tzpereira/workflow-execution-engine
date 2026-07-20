# Artifact

Non-normative. The testable rules are [spec/artifacts.md](../spec/artifacts.md) (`REQ-ARTIFACT-*`).
Implementation: `core/domain/artifact.go`, `core/store/`.

An Artifact is an immutable, content-addressed output produced by a node — a Worker's Contract-valid
response, or a Tool's result. Artifacts are what flow along edges (subject to each downstream node's
Context Policy) and what the Node Cache keys on.

## Types

```
code · markdown · json · diff · image · file · report · test-result · metrics
```

A node's output is tagged with exactly one of these (`domain.ArtifactType`). The tag is assigned by the
producer, not inferred from content: a Worker's Contract output is always `json` (it's validated JSON,
whatever shape the schema describes internally — a Contract field named `markdown` doesn't make the
Artifact type `markdown`, see [prd-generation](../../examples/prd-generation/README.md)'s own note on this);
a Tool's output defaults to `json` too unless the Tool implements the optional `ArtifactType()` method
(only `terminal.Tool` does today, configurable per instance — see [tools.md](tools.md)).

## Content-addressed, deduplicated

`core/store` keys every Artifact's bytes by their SHA-256 hash (ADR 0004: canonical JSON, stable key
order). Identical content — even produced by different nodes, different runs, different workflows — is
stored exactly once. This is what makes the Node Cache free on a hit (the bytes are already on disk) and
what makes an execution directory alone sufficient to reconstruct a full timeline (REQ-ARTIFACT-01/02): the
event log records hashes; the store holds the bytes those hashes point to.

## Rendered, not just dumped (REQ-UI-04)

The UI's Inspector renders each type with a dedicated viewer rather than a raw JSON dump: Diff
(side-by-side/unified), Markdown/Report (sanitized HTML), JSON/Metrics (tree + raw toggle), Code
(syntax-highlighted), TestResult (pass/fail + log), Image, and a generic File download — with a raw-text
fallback for anything a future type doesn't yet special-case. See `ui/src/components/ArtifactViewer.tsx`.

## Related

- [event.md](event.md) — `ArtifactCreated` records the hash+type; the bytes live in the store
- [context-policy.md](context-policy.md) — what determines which Artifacts a downstream node sees
- [../cache-deep-dive.md](../cache-deep-dive.md) — how an Artifact's hash feeds the cache key

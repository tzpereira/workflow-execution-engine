# prd-generation

Secondary demo ([VISION.md](../../docs/VISION.md)): `research -> pm -> architect -> reviewer -> prd`. A
linear chain of five LLM Workers with no tool-backed steps besides sourcing the brief — every Artifact is a
Worker's own structured Contract output, each one scoped to the minimum context it actually needs.

```
read-brief -> research -> pm -+-> architect -+-> reviewer -+-> prd
                                \_____________/_____________/
```

Each downstream step's `contextPolicy` names exactly the upstream node(s) it needs by id (`mode: artifacts`)
rather than defaulting to every direct parent — `architect` sees `pm`'s output, `reviewer` sees both `pm`
and `architect`, and `prd` (the final synthesis step) sees all four prior Workers'. See
[concepts/context-policy.md](../../docs/concepts/context-policy.md) for why this narrowing is mechanical,
not a convention.

**One naming note:** `prd`'s Contract output has a field named `markdown` (the PRD body itself), but the
node's produced Artifact type is still `json` — a Worker's output Artifact type is always `json` regardless
of what a field inside it is named or contains (see [concepts/artifact.md](../../docs/concepts/artifact.md)).

## Running it

```sh
export OPENAI_API_KEY=sk-...
wee run workflow.yaml --input briefPath=/path/to/brief.md
```

`read-brief` reads its path via `briefPath`, a declared workflow input (REQ-INPUT-01, M1.14a) — same
pattern as [bug-investigation](../bug-investigation/README.md)'s `logPath`.

## Expected cost

Five LLM Workers, four cheap `gpt-4o-mini` calls (`research`, `pm`, `architect`, `reviewer`) and one
`gpt-4o` call for the final `prd` synthesis step (the one that has to hold the most context and produce the
longest output). A typical run costs a few cents, comfortably inside the workflow's own `maxCostUsd: 0.30`
ceiling. The actual figure for any specific run is real accounting, not an estimate — see it via
`wee inspect <id>` or the UI's Metrics panel ([concepts/budget.md](../../docs/concepts/budget.md)).

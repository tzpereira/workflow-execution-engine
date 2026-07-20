# bug-investigation

Secondary demo ([VISION.md](../../docs/VISION.md)): `logs -> hypothesis -> patch -> verify -> apply ->
test -> review`. Also the reference implementation of **REQ-CONTRACT-05's verifier-node pattern**: a cheap,
independent Worker judges an expensive Worker's own output before anything downstream trusts it.

```
read-logs -> hypothesis -+-> patch -> verify-patch -> apply-patch -> test -+-> review
                          \_____________________________________________/
```

`verify-patch` (`gpt-4o-mini`, temperature 0, a two-field `{approved, reason}` Contract) judges `patch`'s
(`gpt-4o`) proposed fix against the stated root cause before `apply-patch` ever runs — the conditional edge
`verify-patch -> apply-patch` carries `condition: {path: approved, op: truthy}`. The producer never gates
itself; a separate judge does. See [writing-contracts.md](../../docs/writing-contracts.md) for why this
pattern beats a self-reported confidence field.

## Running it

```sh
export OPENAI_API_KEY=sk-...
wee run workflow.yaml --input logPath=/path/to/some.log
```

`read-logs` reads its path via `logPath`, a declared workflow input (REQ-INPUT-01, M1.14a — see
[concepts/workflow.md](../../docs/concepts/workflow.md)) — supply it with `--input`, or pick it in the UI's
Run dialog after importing the template. Needs a `wee.yaml` allowlisting the terminal command `test` runs
with (`go` by default) and a real git checkout as the workspace root.

## Expected cost

Four LLM Workers: three cheap `gpt-4o-mini` calls (`hypothesis`, `verify-patch`, `review`) and one `gpt-4o`
call (`patch`, the only one that has to produce actual working code). A typical run costs a few cents,
comfortably inside the workflow's own `maxCostUsd: 0.30` ceiling; a run where `approved` comes back false
skips `apply-patch` and `test` and costs less still. The actual figure for any specific run is real
accounting, not an estimate — see it via `wee inspect <id>` or the UI's Metrics panel
([concepts/budget.md](../../docs/concepts/budget.md)).

## Found during M1.15's real-repo validation

`apply-patch` referenced `${patch.path}`/`${patch.content}` without a direct edge from `patch` — context
resolution only ever sees direct parents, so both placeholders failed to resolve at run time despite
passing schema/graph validation. Fixed by adding a `patch -> apply-patch` edge alongside the existing
`verify-patch -> apply-patch` gating edge. Found while validating [pr-review-autofix](../pr-review-autofix/README.md)
against real repos, which had the identical bug in its own `stage`/`commit` nodes — see that README's
"Real-repo validation" section for the full account.

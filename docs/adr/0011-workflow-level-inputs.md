# ADR 0011: Workflow-level inputs

- **Status:** Accepted
- **Date:** 2026-07-19

## Context

A Workflow was fully self-contained through M1.14: the only way a tool node reached external data was
`${env:NAME}` (the server process's own environment) or `${nodeID.path}` (an upstream artifact). There was
no seam for a caller to say "review *this* PR" or "read *this* log file" at invocation time — a real gap a
user hit directly, asking how a workflow is supposed to know which PR to look at when nothing lets the
interface pass one in.

This is not new scope invented from nothing: `docs/ROADMAP.md`'s M1.9 (CLI) deliverables list `--input` as
a Phase 1 `wee run` flag. M1.9's actual implementation dropped it with an explicit, disclosed gap
(`docs/EXECUTION.md`): *"there is deliberately no `--input` flag — the engine has no external-input seam in
Phase 1... Adding runtime input is an engine capability, not something the CLI should fake."* This ADR is
that engine capability, closing an always-Phase-1 deliverable that M1.9 deferred — not reopening a
Phase-2 decision. Phase 2's M2.5 "webhook triggers" (ROADMAP.md) is a different, unrelated capability
(automatic invocation on an external event) and is untouched by this ADR.

One choice is genuinely contested and worth recording: should a workflow input reuse `${env:NAME}`, or is
it a distinct third placeholder form? An env var is process-global, resolved from whatever the server
happened to be started with, and is treated as a secret end to end — never persisted in a Snapshot,
redacted from events/artifacts/errors (`core/engine/tool_input.go`). A "which PR is this run reviewing"
value is the opposite: it's exactly the kind of fact an audit trail should record, and it needs a distinct
value per invocation of a long-running `wee serve` process, which `os.Getenv` cannot give it. Reusing
`${env:NAME}` for this would either force process restarts per run (defeating the interface use case this
ADR exists for) or quietly break the "secrets never travel" guarantee by mixing non-secret, audit-worthy
values into the same channel. A new, distinct placeholder form keeps both guarantees intact.

## Decision

We will add `Inputs []InputDecl` to `domain.Workflow` (`core/domain/workflow.go`) — `InputDecl{Name,
Required, Default, Description}`, all fields plain strings/bools, no typed/enum values in v1. `nil` on a
Workflow that never declares any serializes to no `"inputs"` key (`core/canonical`'s existing `omitempty`
behavior), so every workflow authored before this ADR keeps hashing identically (ADR 0004 unaffected).

A new whole-string placeholder form, `${input:NAME}`, resolves against a run's supplied values
(`core/engine/tool_input.go`'s `resolvePlaceholder`, parallel to the existing `env:` branch) — same
REQ-WORKER-06 whole-string-only discipline, no embedded/concatenated interpolation. Unlike `${env:NAME}`,
a resolved `${input:...}` value is **not** treated as a secret: it is not redacted, and it **is** persisted
in the execution `Snapshot`/`Timeline` (`core/engine.RunOptions.Inputs`, `Snapshot.Inputs`,
`replay.Timeline.Inputs`) — the entire point is that "what did this run actually target" is answerable from
the audit record alone, the same way `DefinitionHashes`/`Workers` already are (M1.13).

Supplied values merge with declared defaults before any node dispatches
(`core/engine.resolveWorkflowInputs`): a caller-supplied value wins, a `Default` fills the gap otherwise,
and a `Required` declaration satisfied by neither fails the run immediately — before any node runs, the same
"before the call, not after" discipline Budget enforcement already follows (PRIN-05). `core/validate/graph.go`
gains a parallel, static check (`checkInputRefs`, mirroring the existing `checkContextArtifacts` pattern):
every `${input:NAME}` a tool node's input tree references must name a declared `Workflow.Inputs` entry,
caught by `wee validate` before a run ever starts.

Every entry point gets the same seam: `wee run --input KEY=VALUE` (repeatable, cobra
`StringToStringVarP`), `POST /api/run`'s JSON body (`{"workflow":..., "inputs": {...}}`), and the SDK's
`RunOptions.Inputs`. The UI adds one new component, `RunInputsModal` (same overlay shell as
`TemplateGallery`/`CommandPalette`): Toolbar's Run button opens it when the loaded workflow declares any
input, collecting values before calling through to `POST /api/run`; a workflow with no declared inputs runs
exactly as before, unchanged.

`Resume` needed one more fix discovered while wiring this: it rebuilt `RunOptions` from the snapshot but
only restored `Concurrency`/`Budget`, silently dropping `DefinitionHashes`/`Workers` — dormant today only
because nothing downstream of a resumed run's `opts` consumed either field, but active and load-bearing
for `Inputs`, since a resumed run's remaining nodes need the original run's resolved values without asking
the caller to re-supply them. Fixed alongside, recorded as its own commit (see the M1.14a EXECUTION.md
entry), not folded silently into this feature.

## Consequences

- **Easier:** a workflow can be reused across many concrete invocations (many PRs, many log files) without
  hand-editing the workflow file per run or restarting `wee serve` between them; an audit record fully
  answers "what did this run actually target," matching the transparency `DefinitionHashes`/`Workers`
  already give for versioned definitions.
- **Harder:** none identified — the feature is additive and backward-compatible by construction (nil
  `Inputs` is byte-identical to before).
- **Neutral/limits:** v1 supports string-valued inputs only, no typed/enum declarations, and inputs are
  never secrets — a workflow needing a secret at invocation time remains an unsolved, disclosed gap,
  `${env:...}` is still the only door for anything that shouldn't be recorded.
- **Revisit trigger:** if a workflow genuinely needs a non-string (numeric, enum, structured) input, or a
  secret supplied per invocation rather than per process — either needs a new ADR, not an amendment to this
  one.

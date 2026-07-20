# Spec — Workflow-level Inputs

**Prefix:** `REQ-INPUT` · **Status:** DELIVERED (M1.14a) · **Principles:** PRIN-05, PRIN-02, PRIN-08 ·
**Implementation:** `core/domain/workflow.go`, `core/engine/inputs.go`, `core/engine/tool_input.go`,
`core/validate/graph.go` (M1.14a)

A Workflow declares named, string-valued parameters a caller supplies at invocation time — a PR URL, a log
file path, anything a run needs to vary that isn't a secret. See [ADR 0011](../adr/0011-workflow-level-inputs.md)
for why this is a distinct mechanism from `${env:NAME}` (REQ-WORKER-06), not a reuse of it.

### REQ-INPUT-01 — Declaration and resolution
The engine shall let a Workflow declare zero or more named inputs (`name`, `required`, `default`,
`description`); a tool node's input tree may reference one via the whole-string placeholder
`"${input:NAME}"`, resolved from the run's supplied values merged with declared defaults (supplied wins).
- **Rationale:** PRIN-05 — a run's actual parameters should be explicit and mechanically enforced, not
  implicit in an env var only the process starter knows.
- **Delivered by:** M1.14a. **Verified by:** `engine.TestResolveToolInputWorkflowInputReference`,
  `engine.TestResolveToolInputMissingWorkflowInputErrors`, `engine.TestRunSuppliedInputOverridesDefault`,
  `engine.TestRunUsesDefaultWhenInputNotSupplied`.

### REQ-INPUT-02 — Fail-fast on a missing required value
If a declared input is `required` and neither a supplied value nor a `default` satisfies it, then the
engine shall fail the run before any node dispatches, with a distinct sentinel error
(`engine.ErrMissingInput`).
- **Rationale:** PRIN-05 — "before the call, not after," the same discipline Budget enforcement already
  follows; a run half-executed on incomplete parameters is worse than one that never started.
- **Delivered by:** M1.14a. **Verified by:** `engine.TestRunFailsFastOnMissingRequiredInput`,
  `cmd.TestRunMissingRequiredInputExits3` (CLI: exit code 3, the validation-failure class).

### REQ-INPUT-03 — Static reference validation
The engine (`wee validate` and pre-run validation) shall reject any `"${input:NAME}"` reference whose
`NAME` does not name a declared input, reported with a JSON-pointer path.
- **Rationale:** PRIN-08 (mirrors REQ-CTXPOL's own artifact-reference checking) — a typo'd input name
  should fail loudly at authoring time, not resolve to a runtime error deep in a long graph.
- **Delivered by:** M1.14a. **Verified by:** `validate.TestGraphRejectsUndeclaredInputRef`,
  `validate.TestGraphAcceptsDeclaredInputRef`.

### REQ-INPUT-04 — Hash stability for workflows with no inputs
A Workflow with no declared inputs shall hash identically to the same workflow before this capability
existed — `Inputs` is `omitempty` at every layer (domain, canonical JSON, schema).
- **Rationale:** ADR 0004 — a purely additive capability must not silently change every existing workflow's
  content-addressed identity, which would invalidate every recorded cache entry and break `DefinitionHashes`
  pinning for already-run executions.
- **Delivered by:** M1.14a. **Verified by:** `canonical.TestWorkflowInputsNilHashesIdenticalToOmitted`.

### REQ-INPUT-05 — Audit visibility, not secrecy
A resolved input value shall be recorded in the execution `Snapshot`/`Timeline` (unlike a resolved
`${env:NAME}` value, which is never persisted) — an audit of a past run shall answer "what did this run
actually target" from the record alone.
- **Rationale:** PRIN-02 — the audit trail is the single source of truth for what a run did; a run's
  declared parameters are exactly the kind of fact it should never require re-deriving.
- **Delivered by:** M1.14a. **Verified by:** `engine.TestResumeRestoresInputs`,
  `replay.TestAuditExposesResolvedInputs`.

## Related

- [../concepts/workflow.md](../concepts/workflow.md) — how this fits the Workflow's overall shape
- [../adr/0011-workflow-level-inputs.md](../adr/0011-workflow-level-inputs.md) — the `${input:}` vs
  `${env:}` vs M2.5-webhook-triggers design decision
- [workers.md](workers.md) — REQ-WORKER-06's whole-string placeholder discipline, which this reuses

# ADR 0016: Safe Mutation Approval Checkpoints

## Status

Accepted — M2.5.

## Context

Phase 2 introduces workflows that can propose repository changes. Existing tool
events prove what happened after a tool ran, but they do not stop a mutating
operation before it touches the workspace. REQ-RUNTIME-07 requires a persistent
human approval checkpoint before mutation, and M2.5 requires the decision to
survive UI disconnects and `wee serve` restarts.

## Decision

Add three event types to the event catalog:

- `ApprovalRequested`
- `ApprovalGranted`
- `ApprovalRejected`

The checkpoint is identified by a deterministic `checkpointId` derived from the
execution id, node id, tool name, mutation operation, and redacted resolved tool
input. A granted or rejected decision matches only that checkpoint id. Duplicate
decisions are idempotent only when they repeat the same terminal decision; a
conflicting decision is rejected by the control plane.

The scheduler pauses by returning `ExecutionPaused` and appending
`ExecutionFinished {"state":"paused"}` after `ApprovalRequested`. This keeps the
hash-chained log terminal for live-stream clients and prevents restart
reconciliation from cancelling a legitimate paused run. Resume reads the same
log, sees granted/rejected checkpoints, and dispatches only when a matching
grant exists. A matching rejection fails the node without invoking the tool.

Mutating built-in operations are:

- filesystem `write`
- every terminal invocation (conservative: arbitrary commands may mutate)
- git `add`, `commit`, and branch creation/switch
- HTTP methods other than `GET`

Tool inputs are still schema-validated before mutation classification. No
`ToolCalled` event is emitted until a matching approval grant exists, unless the
run was started with explicit unattended-mutation opt-in.

CLI behavior: `wee run` remains non-mutating by default. A mutating checkpoint
causes the run to pause and exit non-zero with the checkpoint recorded. A caller
that deliberately wants unattended local mutation must pass an explicit run-level
opt-in flag.

UI/control-plane behavior: `wee serve` exposes explicit approve/reject endpoints
for currently pending checkpoints. Approval never lives only in process memory;
the event log is the decision record.

## Consequences

- The event catalog changes, intentionally, for M2.5.
- Paused executions are terminal from the live stream's perspective but resumable
  after approval.
- Existing replay remains honest: approval decisions are ordinary events in the
  recorded timeline.
- Conservative terminal classification may ask for approval for read-only
  commands. This is acceptable until terminal command capabilities are modeled
  more precisely.

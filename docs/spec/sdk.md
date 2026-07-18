# Spec — SDK (Go)

**Prefix:** `REQ-SDK` · **Status:** STABLE (delivery M1.10) · **Principles:** PRIN-03, PRIN-04 ·
**Implementation:** `sdk/` (M1.10)

Developers build workflows in code. The SDK is Go — the same module as the engine, embedding it directly
(no subprocess, no serialization boundary at authoring time). A TypeScript authoring SDK comes later
(Phase 2) and generates the same canonical YAML/JSON.

### REQ-SDK-01 — Fluent builder to the same canonical form
The SDK shall provide `sdk.New(...)`, `.Worker(...)`, `.Parallel(...)`, `.Merge(...)`, and `Run(ctx, ...)`,
compiling to exactly the canonical definition format — a workflow defined in YAML and the same workflow
defined via the SDK shall produce **byte-identical content hashes** (REQ-DEF-02).
- **Rationale:** no privileged path; the SDK is a third door into the same room.
- **Delivered by:** M1.10 (`sdk.Builder`, frontier-based `Worker`/`Tool`/`Parallel`/`Merge`; `Run` assembles
  the engine over the in-code Workers). **Verified by:** `sdk.TestSDKAndYAMLHashIdentical` (SDK graph and
  hand-written YAML content-hash identically), `sdk.TestParallelMergeGraphShape`,
  `sdk.TestRunStreamsEventsAndCompletes` (Run + `Events()` + `Wait()`).

### REQ-SDK-02 — Typed artifact access
The SDK shall expose execution results with typed access via generics —
`sdk.Artifact[T any](exec, nodeID) (T, error)` — validated against the node's contract schema.
- **Delivered by:** M1.10. Note: the artifact is validated against the Contract *at execution time*, before
  it is stored (REQ-WORKER-03) — so a worker node's output is already schema-guaranteed; `Artifact[T]`
  decodes that stored, already-valid artifact into the caller's Go type rather than re-running validation.
  **Verified by:** `sdk.TestArtifactTypedAccess`, `sdk.TestArtifactUnknownNodeErrors`.

### REQ-SDK-03 — Flagship in ≤100 lines
The flagship demo (PR review & auto-fix) expressed via the SDK shall fit in at most 100 lines.
- **Rationale:** PRIN-06 — the API earns its keep by being small.
- **Delivered by:** M1.10 (`examples/sdk-pr-review/main.go`, 82 lines). **Verified by:**
  `examples.TestSDKFlagshipUnder100Lines`.

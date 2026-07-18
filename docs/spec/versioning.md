# Spec — Versioning

**Prefix:** `REQ-VERSION` · **Status:** STABLE (delivery M1.8) · **Principles:** PRIN-01, PRIN-09 ·
**Implementation:** `core/registry/` (M1.8)

Everything is versioned — Workflow, Worker, Contract, Tool, Execution. No mutable production state: an
execution references frozen versions, so "what ran" is always answerable.

### REQ-VERSION-01 — Immutable versions
When a workflow (or worker/contract/tool it references) is registered at a version, the engine shall treat
that version as immutable — republishing different content at the same version is an error, not an
overwrite.
- **Rationale:** PRIN-09; cache keys (REQ-CACHE-01) and replay (REQ-REPLAY-02) depend on it.
- **Scope note:** a Contract has no version of its own (embedded in a Worker, versioned with it); there is
  no serializable Tool *definition* type (ADR 0008 — tools are runtime code with a `Version()` method, and
  their versions are already recorded in the cache key, `cache.Inputs.ToolVersions`). So immutability is
  enforced on **Workflow** and **Worker** registration; Contract is covered transitively.
- **Delivered by:** M1.8 (`registry.Registry`, `*registry.ConflictError`). **Verified by:**
  `registry.TestImmutableVersionRejectsMutation` (different content at a taken version is rejected, naming
  both hashes; a version bump is the sanctioned path), `registry.TestReRegisterIdenticalContentIsNoOp`.

### REQ-VERSION-02 — Executions pin versions
When an execution starts, the engine shall record the exact versions of everything it runs (in the frozen
snapshot, REQ-EVENT-04), so replay resolves versions from the record — never "latest".
- **Rationale:** PRIN-01; replay (REQ-REPLAY-02) and audit (REQ-REPLAY-01) read the pinned record, not the
  current registry state.
- **Delivered by:** M1.8. The M1.2 snapshot already carries the full workflow content; M1.8 adds each
  referenced worker's content hash (`engine.Snapshot.DefinitionHashes`, populated from
  `registry.DefinitionHashes(wf)` via `RunOptions`), surfaced on `replay.Timeline.DefinitionHashes`.
  **Verified by:** `registry.TestSnapshotPinsDefinitionHashesForReplay` (pin v1, ship a rewritten v2 to the
  registry, audit the old execution back to v1's hash — Audit holds no registry reference, so this is
  structural).

### REQ-VERSION-03 — Export/import round-trips
The engine shall export a named version (`wee export <name>@<version>`) to a self-contained definition
that imports elsewhere with an identical content hash (REQ-DEF-02).
- **Delivered by:** M1.8 (`registry.Registry.Export` → tar of canonical JSON, `registry.Import`), M1.9
  (CLI surface). Secrets never travel: definitions hold only `${env:NAME}` *references* (NFR-SEC-01) and
  Export resolves nothing, so no value can appear; the references are preserved for portability. **Verified
  by:** `registry.TestExportImportRoundTripsIdenticalHash` (byte-identical content hashes across the
  round-trip), `registry.TestExportExcludesResolvedSecretsPreservesReferences`.

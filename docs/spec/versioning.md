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
- **Delivered by:** M1.8. **Verified by:** _pending_.

### REQ-VERSION-02 — Executions pin versions
When an execution starts, the engine shall record the exact versions of everything it runs (in the frozen
snapshot, REQ-EVENT-04), so replay resolves versions from the record — never "latest".
- **Delivered by:** M1.8 (M1.2 snapshot already carries the workflow). **Verified by:** _pending_.

### REQ-VERSION-03 — Export/import round-trips
The engine shall export a named version (`wee export <name>@<version>`) to a self-contained definition
that imports elsewhere with an identical content hash (REQ-DEF-02).
- **Delivered by:** M1.8 (core), M1.9 (CLI). **Verified by:** _pending_.

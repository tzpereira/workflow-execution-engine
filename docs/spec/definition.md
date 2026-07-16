# Spec — Workflow Definition

**Prefix:** `REQ-DEF` · **Status:** DELIVERED (M1.1) · **Principles:** PRIN-01, PRIN-03, PRIN-04 ·
**Implementation:** `core/domain/`, `core/serialize/`, `core/canonical/`, `core/validate/`, `schemas/`

A workflow is data — serializable, diffable, versionable — never trapped in a UI or a runtime. YAML, JSON,
and the SDK are three doors into one canonical form.

### REQ-DEF-01 — One domain model, two equivalent formats
The engine shall load and save workflow definitions in YAML and JSON such that both formats express the
identical domain model, and loading either format yields the same canonical value.
- **Rationale:** ADR 0003; no privileged format, no proprietary format.
- **Delivered by:** M1.1. **Verified by:** `TestRoundTrip`, `TestLoadWorkflowFormatsAgree`.

### REQ-DEF-02 — Canonical form and content hash
The engine shall produce a canonical JSON encoding (sorted keys, preserved number precision, no HTML
escaping) and a SHA-256 content hash for any domain value, stable across field order and format of origin.
- **Rationale:** ADR 0004 — hashing powers artifact identity, the node cache, and definition equality.
- **Delivered by:** M1.1. **Verified by:** `TestMarshalSortsKeysDeterministically`,
  `TestMarshalPreservesNumberPrecision`, `TestMarshalNoHTMLEscaping`, `TestHashStableAndOrderIndependent`.

### REQ-DEF-03 — Schema validation with positional errors
When a definition is loaded, the engine shall validate it against the JSON Schemas in `schemas/`
(draft 2020-12) and report each violation with the offending file and **source line**, not just a JSON
pointer.
- **Rationale:** ADR 0005; errors an engineer can click.
- **Delivered by:** M1.1. **Verified by:** `TestNewValidatorCompilesAllSchemas`,
  `TestValidateAcceptsValidWorkflow`, `TestValidateReportsPositionalError`.

### REQ-DEF-04 — Graph well-formedness
When a definition is loaded, the engine shall reject cycles, unresolved edge endpoints, orphan nodes, and
context references to artifacts that are not upstream of the referencing node — each with the offending id
and source line.
- **Delivered by:** M1.1. **Verified by:** `TestGraphAcceptsValidDiamond`, `TestGraphRejectsCycle`,
  `TestGraphRejectsUnresolvedEdge`, `TestGraphRejectsOrphan`, `TestGraphRejectsContextArtifactNotUpstream`.

### REQ-DEF-05 — Schemas and Go structs never drift
The build shall fail if the Go domain structs and the JSON Schemas disagree (round-trip drift check in CI).
- **Rationale:** `schemas/` is the language-neutral source of truth; silent drift would fork it.
- **Delivered by:** M1.1. **Verified by:** `TestSchemaDrift`.

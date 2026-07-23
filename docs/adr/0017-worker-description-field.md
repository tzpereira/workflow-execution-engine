# ADR 0017: Optional human-facing `Worker.description` field

- **Status:** Accepted
- **Date:** 2026-07-22

## Context

M2.12 (Model Transparency & Flagship Proof) requires the product to make each node's identity legible:
whether it is model-backed, and for a Worker its name, version, and a human-facing description, alongside the
resolved model (REQ-UI-17..19). Today `domain.Worker` carries `id`, `version`, `objective`, `constraints`,
`tools`, `contextPolicy`, `contract`, and `model` — no field's job is to describe the Worker to a person.
`objective` is the *behavioral* instruction the Contract compiler turns into model context; overloading it as
the human-facing description would couple UI copy to model behavior. `domain.Workflow` already has a
`Description` field, so Worker is the asymmetric gap.

M1.6 froze the domain model. [ADR 0008](0008-tool-backed-graph-nodes.md) established the pattern for narrow,
disclosed exceptions to that freeze. The project owner decided (2026-07-22) to add a dedicated field rather
than reuse `objective`.

## Decision

We will add an **optional** `description` string to `domain.Worker`, `schemas/worker.schema.json`, and the Go
authoring SDK, distinct from `objective`. Because it is optional, `worker.schema.json`'s `required` list is
unchanged. `description` is part of the canonical Worker definition — it participates in the content hash and
versioning (REQ-VERSION-01..03), so editing it is a definition change that requires a version bump — but the
Contract compiler will **not** include it in the compiled model context: it never reaches the model and never
affects output. It is human-facing metadata surfaced in the UI (REQ-UI-18), nothing more.

## Consequences

- **Easier:** the UI can show a real description without overloading `objective`; Worker reaches parity with
  Workflow's existing `Description`; no change to model behavior or compiled context, so existing executions
  and cache semantics are unaffected except through the ordinary version-bump rule.
- **Harder:** `worker.schema.json`, the Go struct, the SDK builder, and the round-trip/drift tests
  (`domain.TestSchemaDrift`, serialization round-trip) all gain the field — this is M2.12 implementation work,
  not done in this ADR.
- **Neutral/limits:** a `description` edit changes the Worker's content hash (a new version,
  cache-invalidating for that node) even though model behavior is identical — consistent with PRIN-09 (any
  definition change is a different definition), accepted as the honest cost of treating `description` as part
  of the definition rather than as untracked cosmetic text. A test must assert `description` never appears in
  the compiled model input.
- This is a narrow, disclosed exception to the M1.6 domain freeze, mirroring ADR 0008; it does not reopen the
  freeze generally.

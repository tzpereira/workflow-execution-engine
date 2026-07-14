# ADR 0004: Contract validation — JSON Schema draft 2020-12 via santhosh-tekuri/jsonschema/v6

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

Contracts are enforced, not suggested: every Worker output must be validated
against a required output schema before it is allowed downstream, and the same
schemas drive UI form generation. The schema language is **JSON Schema draft
2020-12** — language-neutral, with `schemas/` as the single source of truth (see
`docs/VISION.md` → "Contracts"). Go needs a mature, spec-compliant 2020-12
validator; hand-rolling a full validator (with `$ref`/`$dynamicRef` resolution,
format vocabularies, and the hundreds of official test-suite edge cases) is a
multi-month effort not worth reinventing.

`docs/EXECUTION.md` §1 originally pinned `santhosh-tekuri/jsonschema/v5`. The
dependency diagnostic in §1a established that the `v5` module line has had no
commits since 2024-05-03 (frozen), while active fixes land in the `v6` module,
which is also what Helm, kubeconform, and golangci-lint depend on today.

## Decision

We will validate all domain objects and Contract output schemas against **JSON
Schema draft 2020-12** using **`github.com/santhosh-tekuri/jsonschema/v6`**,
wrapped behind `core/validate/`. This replaces any runtime-specific validator.
The choice of **v6 over v5 was resolved on 2026-07-14** in favor of the
maintained module line. `core/validate` returns human-readable, positional
errors (file:line when the source was YAML).

## Consequences

- Contracts stay language-neutral; the engine validates and the UI generates
  forms from the exact same schema files — no hand-copied field lists.
- Tracking the maintained (`v6`) line means bug fixes are available and the
  project matches what major consumers (Helm/kubeconform/golangci-lint) run.
- Risk, accepted: `v6` had not tagged a release in 14+ months as of this
  decision, and the library is effectively single-maintainer. Mitigations: it is
  Apache-2.0 (vendoring/forking is unrestricted if abandoned) and carries zero
  known CVEs across OSV.dev, the GitHub Advisory Database, and Snyk. One open
  upstream issue (oversized-number → unbounded `big.Rat`) is noted for watch.
- Full sourced diagnostic and the alternatives considered
  (`kaptinlin/jsonschema`, `google/jsonschema-go`) live in `docs/EXECUTION.md`
  §1a; revisit `google/jsonschema-go` once it has a longer track record.

# ADR 0003: Serialization — YAML is canonical authoring, JSON is the wire/storage form, round-trip is loss-free

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

Workflows and every other domain object must be serializable, human-authorable,
and machine-processable, with a single in-process representation shared by the
engine, the CLI, and the UI. Hashing (ADR 0004) needs one unambiguous byte
representation. See `docs/VISION.md` → "Workflow Definition".

## Decision

We will treat **YAML as the canonical human-authoring format** and **JSON as the
equivalent wire and storage format**. Both deserialize into the *same* Go structs
in `core/domain/`, so they are two encodings of one model, not two models.
**Round-trip must be loss-free**: parse → serialize → parse yields a struct
identical to the original (enforced by round-trip property tests in M1.1). For
hashing and cache keys, the JSON form is further reduced to *canonical* JSON
(deterministic sorted key order) — see ADR 0004.

## Consequences

- Authors get YAML ergonomics (comments, readability); machines and the UI
  exchange JSON; neither is privileged in meaning.
- The UI can read and write the same files the engine executes — no proprietary
  or UI-only format ever exists.
- A dedicated canonical marshaller (`core/canonical/`) must be maintained, since
  Go's default map iteration order is not stable enough for hashing.
- The loss-free guarantee is a testable invariant, not an aspiration; it gates
  M1.1.

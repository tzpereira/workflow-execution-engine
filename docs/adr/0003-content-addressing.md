# ADR 0003: Content addressing — SHA-256 over canonical JSON for artifact and cache keys

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

Artifacts are immutable and must have a stable identity that depends only on
their content, not on serialization incidentals (key order, whitespace). The
Node Cache needs the same property so that identical inputs deterministically
produce identical keys. See `docs/VISION.md` → "Artifact System" and "Node
Cache".

## Decision

We will derive every content identity — **artifact IDs and cache keys** — as the
**SHA-256 hash of the canonical JSON** (deterministic, sorted-key marshaling per
ADR 0002) of the content being addressed. Every hash in the project routes
through a single function in `core/canonical/`; no component computes a hash any
other way.

## Consequences

- Identical content yields an identical hash, giving automatic deduplication in
  the artifact store and exact cache-key matching.
- Artifacts are immutable and content-addressed, which is precisely what powers
  the Node Cache (cache-key composition in M1.6 builds directly on this).
- Cache invalidation is total, not fuzzy: any change to any input changes the
  canonical bytes and therefore the key.
- This depends on the canonical marshaller (ADR 0002 / M1.1) existing and being
  the sole hashing path; a second, divergent marshaller would silently break
  cache correctness.

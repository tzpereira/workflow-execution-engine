# ADR 0007: Hash-chained event log

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

The event log (M1.2) is append-only **by convention**: nothing structurally prevents a line from being
edited, deleted, or the file truncated after the fact. The product's core promise is auditability
(PRIN-01, PRIN-09) — "inspected exactly as it happened" is only as strong as the record's resistance to
tampering. Artifacts already get this structurally via content addressing (ADR 0004); executions' *history*
does not. The commercial savings report (VISION, Business Model) also leans on the log being credible.

Doing this later means migrating existing execution logs; doing it now (M1.4, before any real model-backed
executions exist) means a format change with nothing to migrate.

## Decision

We will **hash-chain the event log**: every `Event` carries a `prevHash` field — the canonical SHA-256 of
the preceding event in its execution's log, with the first event chaining from the execution snapshot's
hash. `eventlog.Append` computes and writes the chain; a `Verify(executionID)` routine walks the log and
reports the first break (REQ-EVENT-03, retrofit task in M1.4).

## Consequences

- **Easier:** tampering (edit, deletion, truncation, reordering) becomes *detectable* rather than merely
  forbidden; the audit and savings-report stories gain a structural guarantee; verification is cheap (one
  linear pass, hashes we already know how to compute via `core/canonical`).
- **Harder:** events can no longer be written independently of their predecessor — `Append` is inherently
  sequential per execution (already true under the existing mutex); any future log-compaction or
  redaction feature must re-chain and be explicit about it.
- **Neutral/limits:** the chain proves *internal* consistency, not external anchoring — a party who
  rewrites the whole chain from the break point onward defeats it. External anchoring (e.g. publishing
  head hashes) is a possible Phase 2 hardening, not promised now.
- Snapshot format and `event.schema.json` gain a field; done before any production logs exist, so no
  migration.

# Spec — Artifact System

**Prefix:** `REQ-ARTIFACT` · **Status:** DELIVERED (M1.2) · **Principles:** PRIN-03, PRIN-09 ·
**Decisions:** ADR 0004 · **Implementation:** `core/domain/artifact.go`, `core/store/`

Everything produces artifacts — not text, artifacts. Typed (`code`, `markdown`, `json`, `diff`, `image`,
`file`, `report`, `test-result`, `metrics`), immutable, content-addressed. Artifacts are the composition
boundary (PRIN-03): downstream Workers consume them, the cache keys on them, replay reloads them.

### REQ-ARTIFACT-01 — Content-addressed identity
The engine shall address every artifact by the SHA-256 of its content; identical content shall be stored
exactly once (deduplication), and distinct content shall never collide into one entry.
- **Rationale:** PRIN-09 — a changed artifact is a *different* artifact by construction.
- **Delivered by:** M1.2. **Verified by:** `TestPutDedupesIdenticalContent`,
  `TestDistinctContentDistinctFiles`, `TestGetRoundTrip`.

### REQ-ARTIFACT-02 — Concurrency-safe store
While concurrent executions write the same content, the store shall remain consistent and still yield a
single stored copy (temp-file + rename discipline).
- **Delivered by:** M1.2. **Verified by:** `TestConcurrentPutSameContentYieldsOneFile`.

### REQ-ARTIFACT-03 — Typed artifacts
The engine shall record each artifact's declared type and MIME type, so consumers (downstream nodes,
viewers, tools) can interpret content without sniffing it.
- **Delivered by:** M1.1 (types), M1.2 (persistence). **Verified by:** schema tests, store round-trip.

### REQ-ARTIFACT-04 — Missing artifact is an explicit error
If a requested hash is absent from the store, then the store shall return a distinct not-found error —
never an empty artifact.
- **Delivered by:** M1.2. **Verified by:** `TestGetMissingIsError`.

### REQ-ARTIFACT-05 — Bounded artifact storage and explicit retention
The artifact store shall bound single-artifact size and total artifact-directory size by default, reject
oversized output before publishing it, include a bounded preview summary in the limit error, support
streaming writes through the same content-addressed identity, and expose explicit garbage collection over a
caller-provided keep-set rather than deleting artifacts implicitly.
- **Rationale:** M2.4 robust runtime — runaway tool/provider output must be bounded without weakening
  replay/export's content-addressed guarantees.
- **Delivered by:** M2.4. **Verified by:** `store.TestPutRejectsArtifactOverLimitWithSummary`,
  `store.TestPutRejectsStoreQuota`, `store.TestGarbageCollectRemovesUnreferencedArtifacts`,
  `engine.TestLongGraphStressBoundedEventsAndArtifacts`.

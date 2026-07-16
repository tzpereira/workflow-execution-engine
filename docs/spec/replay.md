# Spec — Replay

**Prefix:** `REQ-REPLAY` · **Status:** STABLE (delivery M1.7) · **Principles:** PRIN-01, PRIN-05 ·
**Implementation:** `core/replay/` (M1.7)

Any execution can be replayed — honestly. Replay never pretends LLMs are deterministic; it distinguishes
inspecting the record from re-running the process.

### REQ-REPLAY-01 — Audit replay, zero cost
The engine shall render a recorded execution (timeline, events, artifacts, costs) purely from its snapshot,
event log, and artifact store — zero model calls, zero cost, byte-identical artifacts.
- **Rationale:** PRIN-01 — "audited exactly as it happened" is a read, not a re-run.
- **Delivered by:** M1.7. **Verified by:** _pending_ (replay with providers unreachable still succeeds).

### REQ-REPLAY-02 — Re-execution with identical configuration
When asked to re-execute, the engine shall run the frozen workflow version with identical graph, contracts,
and context policies; cached nodes are reused (REQ-CACHE-02) and only invalidated nodes reach a model.
- **Rationale:** PRIN-01 (same process) + PRIN-05 (pay only for what changed).
- **Delivered by:** M1.7. **Verified by:** _pending_.

### REQ-REPLAY-03 — The two modes are never conflated
The CLI and UI shall present audit replay and re-execution as distinct operations with distinct names and
costs; documentation shall state plainly what is and is not guaranteed to be identical.
- **Rationale:** honesty about nondeterminism is a stated differentiator (PRIN-01's caveat).
- **Delivered by:** M1.7 (core), M1.9 (CLI), M1.15 (docs page). **Verified by:** _pending_.

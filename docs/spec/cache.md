# Spec — Node Cache

**Prefix:** `REQ-CACHE` · **Status:** STABLE (delivery M1.6; remote in M2.2) · **Principles:** PRIN-05
(core), PRIN-01 · **Implementation:** `core/cache/` (M1.6)

The other strongest differentiator, inspired by Turborepo/Nx: never pay for the same work twice. A node
whose inputs haven't changed returns its cached artifact instead of calling the model — re-running a
workflow after changing one node re-executes only downstream of the change.

### REQ-CACHE-01 — Deterministic cache key
The engine shall derive a node's cache key from the canonical hashes of: Worker version, Contract version,
resolved input artifacts, model + parameters, and tool versions — nothing else, nothing less.
- **Rationale:** PRIN-01 — the key *is* the reproducibility statement; content addressing (ADR 0004) makes
  it byte-stable.
- **Delivered by:** M1.6. **Verified by:** _pending_.

### REQ-CACHE-02 — Hit returns the recorded artifact
When a node's cache key matches a prior execution, the engine shall return the cached artifact
byte-identically, emit `CacheHit` (with the key), skip the model call entirely, and record zero
cost for the node; on a miss it shall emit `CacheMiss`.
- **Delivered by:** M1.6. **Verified by:** _pending_ (re-run of unchanged workflow → zero model calls).

### REQ-CACHE-03 — Precise invalidation
If one node's definition or inputs change, then the engine shall re-execute only that node and its
downstream cone; unchanged siblings stay cached.
- **Rationale:** PRIN-05 — iteration cost is proportional to the change, not the workflow.
- **Delivered by:** M1.6. **Verified by:** _pending_ (tweak one reviewer → only Fixer/downstream re-run).

### REQ-CACHE-04 — Cache modes and inspection
The engine shall support `cache=on|off|readonly` per run, and the CLI shall expose `wee cache
ls|inspect <key>|clear`.
- **Rationale:** PRIN-02 — a cache you can't inspect is a cache you can't trust.
- **Delivered by:** M1.6 (core), M1.9 (CLI). **Verified by:** _pending_.

Saved spend from cache hits feeds savings accounting — see REQ-METRIC-03.

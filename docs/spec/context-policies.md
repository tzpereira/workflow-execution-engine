# Spec — Context Policies

**Prefix:** `REQ-CTXPOL` · **Status:** STABLE (delivery M1.4) · **Principles:** PRIN-05 (core), PRIN-01,
PRIN-02 · **Implementation:** `core/domain/context_policy.go`, `core/policy/` (M1.4)

One of the two strongest differentiators. Each Worker declares exactly what context it may see: parent
output only, specific artifacts, diff only, summary only, full history. The resolver produces that slice —
nothing more — and logs what was actually included. This is the token-economy principle made mechanical:
a reviewer that reads only the diff cannot be bloated by a sibling's output, and cannot be biased by it
either.

Workspace persistence is artifact-based and minimal (no RAG, no vector stores — constitutional non-goals);
"what a Worker knows" is always expressible as "which artifacts its policy admits".

### REQ-CTXPOL-01 — Policy-resolved context slice
When dispatching a node, the engine shall resolve the Worker's declared context policy against the current
execution state and provide the Worker **exactly** the resulting slice of upstream artifacts/history — no
implicit additions.
- **Rationale:** PRIN-05 (minimal context is enforced, not hoped for).
- **Delivered by:** M1.4. **Verified by:** _pending_ (diff-only policy: compiled context contains the diff
  artifact and nothing from a sibling Planning node).

### REQ-CTXPOL-02 — Minimal by default
If a node declares no context policy, then the engine shall default to the **smallest** slice that
satisfies its contract inputs (parent output only) — never "full history". Widening context is an explicit,
declared act.
- **Rationale:** PRIN-05 — a senior engineer doesn't paste the repo into a review; defaults encode that.
- **Delivered by:** M1.4. **Verified by:** _pending_.

### REQ-CTXPOL-03 — Resolved context is auditable
When a context slice is resolved, the engine shall record what was actually included (artifact hashes, not
copies) so any execution can later answer "what did this Worker see?" exactly — via events/Inspector.
- **Rationale:** PRIN-01, PRIN-02; also the substrate for savings accounting (REQ-METRIC-03).
- **Delivered by:** M1.4 (recording), M1.13 (Inspector surface). **Verified by:** _pending_.

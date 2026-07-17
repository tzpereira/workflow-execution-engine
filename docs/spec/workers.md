# Spec — Workers

**Prefix:** `REQ-WORKER` · **Status:** STABLE (delivery starts M1.4) · **Principles:** PRIN-03, PRIN-04,
PRIN-05 · **Implementation:** `core/domain/worker.go`, `core/engine/node.go` (executor seam), M1.4 onward

A Worker represents a **role** — reviewer, fixer, planner — not a persona and not an "agent". A Worker is
fully described by data: objective, constraints, allowed tools, context policy, output contract, and model
configuration. Workers are interchangeable: swapping the model or provider behind a Worker changes cost and
quality, never the workflow's shape.

### REQ-WORKER-01 — Worker as declarative role
The engine shall define a Worker entirely by its declared objective, constraints, tool allowlist, context
policy, output contract, and model configuration (`provider`, `model`, `params`) — no imperative code, no
hidden state.
- **Rationale:** PRIN-04; roles are reviewable data (versionable per REQ-VERSION-01).
- **Delivered by:** M1.1 (struct + schema), M1.4 (execution). **Verified by:** schema tests (M1.1);
  `engine.TestNoMalformedOutputCrossesBoundary` (M1.4 execution).

### REQ-WORKER-02 — Uniform executor boundary
The engine shall invoke every Worker through the single `NodeExecutor` boundary (`Execute(ctx, node,
inputs) → NodeResult`), so scheduling, retry, budgeting, caching, and event emission are identical for
model-backed, tool-backed, and stub executors.
- **Rationale:** PRIN-02 — one seam to observe; one seam to test against.
- **Delivered by:** M1.3 (seam), M1.4 (model-backed executor). **Verified by:** scheduler tests run
  entirely through the seam (M1.3); `engine.WorkerExecutor` tests (M1.4).

### REQ-WORKER-03 — No malformed output crosses the boundary
The engine shall guarantee that no Worker output that fails its contract validation is ever visible to a
downstream node — enforcement happens inside the executor boundary, not as an optional post-step.
- **Rationale:** PRIN-08; this is what makes a Contract enforcement rather than suggestion.
- **Delivered by:** M1.4. **Verified by:** `engine.TestNoMalformedOutputCrossesBoundary`,
  `TestMalformedNeverReachesDownstream` (enforcement inside the `NodeExecutor` boundary).

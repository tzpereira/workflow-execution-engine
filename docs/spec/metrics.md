# Spec — Metrics, Artifact Value & Savings

**Prefix:** `REQ-METRIC` · **Status:** DRAFT (delivery M1.4 → M1.14; savings report is Phase 2 commercial)
· **Principles:** PRIN-02, PRIN-05, PRIN-08

Cost per artifact is table stakes; **value** per artifact is the differentiator nobody measures. Value is
approximated by honest proxies — the platform never claims to measure quality directly, it measures the
signals quality leaves behind. Slop shows up here as what it is: cost without consumption (PRIN-08).

### REQ-METRIC-01 — Cost and usage metrics
The engine shall record, per node and rolled up per execution: duration, input/output tokens, cost (USD),
cache hits/misses, retries, contract violations, and failures.
- **Delivered by:** M1.4 (accounting), M1.14 (UI surface). **Verified by:** `ui/src/core/metrics.test.ts`,
  `ui/src/components/MetricsPanel.test.tsx`; manually verified against a real execution
  (`docs/EXECUTION.md`'s M1.14 notes: cost/tokens/duration/cache-hit-rate/retries/violations/failures all
  read correctly off a live `architecture-review` run).

### REQ-METRIC-02 — Artifact value proxies
The engine shall record, per artifact: **first-pass acceptance** (validated without retries? how many
attempts?), **downstream consumption** (how many nodes actually consumed it), and **reuse** (cache hits
that returned it). These derive entirely from existing events — no new instrumentation on the model.
- **Rationale:** an artifact nobody consumes is cost without value; measuring it makes slop visible
  (PRIN-08) and iteration honest.
- **Delivered by:** M1.14 (derived from the M1.2 event log). **Verified by:** `ui/src/core/metrics.test.ts`
  (`firstPassAccepted`, `downstreamConsumers`). "Reuse" is scoped to within one execution (was this node's
  own result cache-hit this run) — a cross-execution reuse *count* would need correlating cache keys across
  multiple executions' Audits, not attempted here.

### REQ-METRIC-03 — Savings accounting
The engine shall attribute avoided spend to its cause, per execution and cumulatively: cache hits (model
call not made — priced at the producing call's cost), context pruning (tokens excluded by policy vs. the
full-history baseline), and engine-owned loops (bounded retries with delta feedback vs. re-inflated
context). Derived from the event log; auditable like everything else.
- **Rationale:** PRIN-05 needs receipts. This is also the substrate of the commercial savings report —
  the *mechanisms* of economy are OSS core forever; what the paid tier sells is the managed **proof**
  (dashboards, per-team reports) — see VISION Business Model.
- **Delivered by:** M1.14 (local accounting — cache-hit savings only); Phase 2 M2.5 (team-level report,
  commercial). **Verified by:** `ui/src/core/metrics.test.ts` (`savedCostUsd`/`savedTokens`, cache-hit
  category only). Context-pruning and retry-avoidance savings need a counterfactual cost model — "what this
  would have cost under a different policy" — that doesn't exist anywhere in the engine; not built here
  rather than guessed at, so this category is **partially** delivered, not fully — re-open if a milestone
  ever needs the other two categories.

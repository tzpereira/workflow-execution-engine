# Execution Plan — Workflow Execution Engine (Phase 2 / Local-First Product)

> The **how** layer for Phase 2. Laws: [CONSTITUTION.md](CONSTITUTION.md). Sequencing:
> [ROADMAP.md](ROADMAP.md). Phase 1 history remains in [EXECUTION.md](EXECUTION.md). Phase 2 starts only
> after the owner explicitly closes or supersedes the remaining Phase 1 release gates.

## 0. How to use this document

This is the active playbook for turning WEE from a capable MVP into a local/self-hosted product developers
want to use weekly.

Rules:

1. Work milestone by milestone. Do not start the next milestone until the current acceptance criteria are
   verified or the owner explicitly changes scope.
2. Keep the local/self-hosted path first. Managed hosting is planning-only until M2.8.
3. Every milestone ends with a runnable example or reproducible product walkthrough.
4. Commit by logical unit of work. Prefix milestone-scoped commits `M2.X: <summary>`; incidental fixes use
   conventional prefixes like `fix:` or `docs:`.
5. If a milestone changes runtime semantics, event semantics, persistence, or safety boundaries, write an
   ADR before implementation.
6. Update this file as work lands: check tasks, record verification commands, and keep `## Status` current.

## Status

- **Current Phase 2 milestone:** M2.2 — Local Control Plane. M2.1 is complete: artifact viewers have
  bounded semantic rendering, generated/code artifacts have language/wrap/copy/download controls, metrics
  include usage/health/replay-cache comparison charts, and raw/debug payloads stay behind explicit
  disclosure.
- **Transition decision:** M1.16/M1.17 are superseded for now by this Phase 2 plan. Do not tag a public
  release or start managed hosting work until the local/self-hosted product quality gates here pass.

---

## M2.0 — UX Reset

**Goal:** remove the remaining boilerplate feeling and make the local product feel like a focused developer
tool.

**Depends on:** explicit owner decision to enter Phase 2.

Tasks:

- [x] Audit the current UI routes, tabs, panels, components, and examples; delete or hide unused product
      surfaces.
- [x] Redesign the application shell around the real workflow: choose template/import, configure, run,
      inspect, retry/replay, export.
- [x] Rework node cards so status, failure cause, cost/tokens, cache state, and primary output preview are
      visible without expanding raw data.
- [x] Rework Inspector layout: output first, then inputs/context/contract/events/debug.
- [x] Rework Timeline/Logs/Metrics/History into a coherent observability area with stable sizing.
- [x] Add empty, loading, failed, cancelled, rate-limited, budget-exceeded, and no-provider states.
- [x] Validate responsive desktop and mobile layouts with screenshots.

Acceptance:

- [x] A first-time user can import a practical workflow, configure inputs/provider/budget, run, inspect, and
      replay without editing YAML.
- [x] No primary product surface shows unbounded raw JSON by default.
- [x] Screenshots show no overlapping controls or unreadable primary text.
- [x] Verification recorded here: `pnpm --dir ui lint`; `pnpm --dir ui typecheck`; `pnpm --dir ui test`
      (171 tests); `pnpm --dir ui build`; Chrome headless screenshots at 1440x900 and 390x844 after the
      Inspector overflow fix. Build still reports the known Shiki/wasm chunk-size warning.

---

## M2.1 — Output & Observability

**Goal:** make results, cost, reuse, and failure causes immediately understandable.

**Depends on:** M2.0.

Tasks:

- [x] Build or refine semantic viewers for code, diff, markdown/report, JSON tree, HTTP response, test
      result, metrics, and risk/analysis artifacts.
- [x] Add code viewer controls: language detection, copy/download, wrapping, bounded height, and syntax
      highlighting.
- [x] Add charts for per-node cost, tokens, duration, cache hits, retries, failures, contract violations,
      and savings attribution.
- [x] Make replay/divergence visible as a comparison, not a raw event dump.
- [x] Keep raw payloads available behind explicit debug disclosure.
- [x] Add tests for viewer selection, bounded rendering, and chart data derivation.

Acceptance:

- [x] A user can answer "what happened, what did it cost, what was reused, and why did this node fail?"
      from the UI in under one minute.
- [x] Large artifacts stay readable and bounded.
- [x] Verification recorded here: `pnpm --dir ui lint`; `pnpm --dir ui typecheck`; `pnpm --dir ui test`
      (172 tests); `pnpm --dir ui build`. Build still reports the known Shiki/wasm chunk-size warning.

---

## M2.2 — Local Control Plane

**Goal:** make `wee serve` a durable local service, not a fragile demo server.

**Depends on:** M2.1.

**Requirements:** REQ-CTRL-01..07, NFR-CTRL-01 ([spec/control-plane.md](spec/control-plane.md)).
**Decision:** [ADR 0012](adr/0012-local-control-plane.md) — in-workspace persistence, in-memory run
registry reconciled from disk on restart, run controls as thin surface over existing core capabilities,
non-secret settings, transport-derived progress.

Tasks:

- [ ] Define local service persistence: config directory, data directory, execution index, artifact store,
      cache index, settings, and workflow catalog.
- [ ] Persist settings reliably: provider references/base URLs, default budgets, cache mode, workspace root,
      and template paths.
- [ ] Add run controls: start, cancel, retry failed, retry from node, resume, replay, clear cache, export
      execution bundle.
- [ ] Surface long-running execution heartbeats/progress.
- [ ] Ensure service restart preserves completed executions, resumable state, settings, and cache.
- [ ] Add API and UI tests for retry/resume/cancel/replay flows.

Acceptance:

- [ ] Killing and restarting `wee serve` does not lose completed executions, settings, cache index, or
      pending resumable state.
- [ ] Retrying a failed node does not repeat completed upstream work or pay for cached nodes again.
- [ ] Verification recorded here:

---

## M2.3 — Workflow Authoring & Practical Examples

**Goal:** make workflows easier to author and ship examples that feel like real developer jobs.

**Depends on:** M2.2.

Tasks:

- [ ] Improve Workflow/Worker/Contract editing with inline validation, version-bump guidance, schema-aware
      fields, and safe rollback.
- [ ] Expand practical templates: Change/Diff Review, Test Generator, Change Risk, Bug Investigation,
      Release Notes, Refactor Plan, Dependency Audit.
- [ ] Add guided inputs, expected cost, expected runtime, required tools, and read-only/mutating labels to
      every published template.
- [ ] Keep change-source logic out of Core: GitHub PR, GitLab MR, Bitbucket PR, public patch/diff URL,
      local `git diff`, and local file inputs must be represented through generic workflow/tool
      configuration.
- [ ] Ensure public-remote workflows work without cloning when they only need public HTTP data, and local
      repository workflows work without any forge account.
- [ ] Update example READMEs with intended output, budget profile, and cache/replay behavior.

Acceptance:

- [ ] A new practical example can be authored, validated, imported, run, replayed, and exported without
      hand-editing generated UI state.
- [ ] Published templates avoid surprise spend and declare whether they can write before a user starts them.
- [ ] The published catalog demonstrates at least two change-source shapes, one of which is not GitHub.
- [ ] Verification recorded here:

---

## M2.4 — Robust Runtime

**Goal:** make common failures diagnosable, bounded, and recoverable.

**Depends on:** M2.3.

Tasks:

- [ ] Define structured error taxonomy across engine, tools, providers, validation, budget, cache, and UI.
- [ ] Harden provider behavior: 429/5xx retry policy, Retry-After support, timeout controls, partial-output
      handling, and provider diagnostics.
- [ ] Audit cancellation and resume across model calls, tool calls, cache hits, and event persistence.
- [ ] Add artifact limits: quotas, large output streaming, truncation summaries, retention controls, and
      garbage collection.
- [ ] Harden secrets handling: env/keychain references and automated scans across events, artifacts, cache,
      exports, and error paths.
- [ ] Add soak/stress tests for long graphs and long-running executions.

Acceptance:

- [ ] Rate limits, missing files, provider config errors, contract violations, timeouts, and budget limits
      point to the exact node and likely fix.
- [ ] Soak/stress tests show no leaks or unbounded storage growth.
- [ ] Verification recorded here:

---

## M2.5 — Safe Mutations

**Goal:** let workflows propose repository changes while keeping the human in control by default.

**Depends on:** M2.4.

Tasks:

- [ ] Write an ADR for persistent approval checkpoints, event semantics, CLI behavior, and mutating tool
      classification.
- [ ] Add runtime pause/resume checkpoints before filesystem writes, terminal mutations, Git mutations, and
      non-GET HTTP calls.
- [ ] Build proposed-change UI: formatted diff, affected paths, command/API preview, remaining budget, and
      explicit Approve/Reject.
- [ ] Make unattended mutation require explicit run-level opt-in.
- [ ] Build Change Auto-Fix path: review, propose patch, test, create branch/commit locally, and optionally
      open a forge PR/MR only through an explicit workflow-defined integration after approval.
- [ ] Test normal run, retry, cancellation, resume, stale approval, duplicate approval, and rejection paths.

Acceptance:

- [ ] No mutating tool call is emitted before a matching approval event.
- [ ] Closing the UI or restarting `wee serve` while approval is pending cannot approve or lose the
      execution.
- [ ] Verification recorded here:

---

## M2.6 — Self-Hosted Packaging

**Goal:** make installation, operation, backup, and upgrade boring.

**Depends on:** M2.5.

Tasks:

- [ ] Polish single-binary commands: `wee init`, `wee serve`, `wee run`, `wee inspect`, `wee replay`,
      `wee cache`.
- [ ] Add Docker image and Docker Compose path for self-hosted operation.
- [ ] Define config/data directories, migrations, backup/restore, and upgrade notes.
- [ ] Improve CLI progress, help text, stable `--json`, and actionable errors.
- [ ] Run accessibility and performance passes; keep canvas interactive at 200 nodes.

Acceptance:

- [ ] A user can install from release assets or Docker Compose, start the service, run a template,
      stop/restart, and keep history/cache intact.
- [ ] README plus one example explain local/self-hosted operation clearly.
- [ ] Verification recorded here:

---

## M2.7 — Team Self-Hosted

**Goal:** make a small team share executions, workflows, cache, and decisions inside its own environment.

**Depends on:** M2.6.

Tasks:

- [ ] Add multi-user self-hosted workspaces with simple auth, CLI API tokens, and local RBAC.
- [ ] Add shared execution history, shared node cache, shared template library, and execution links.
- [ ] Add workflow and execution version comparison: graph diff, contract diff, divergence view.
- [ ] Add team dashboard: recent executions, cost by workflow/member, cache savings, failure trends.
- [ ] Add audit log for run/edit/approve/reject/share/delete actions.

Acceptance:

- [ ] Member A runs a workflow; Member B's run reuses shared cache where keys match and shows saved cost.
- [ ] An execution link answers "what happened and why" for another team member.
- [ ] Verification recorded here:

---

## M2.8 — Managed Runtime Readiness

**Goal:** prepare hosted operation as a business decision without changing the product architecture.

**Depends on:** M2.7.

Tasks:

- [ ] Write managed-runtime architecture plan: control plane, runners, isolation, key management, retention,
      and billing hooks.
- [ ] Define security baseline: dependency scanning, backups, restore drill, data deletion, incident
      runbook, pen-test plan.
- [ ] Draft pricing/onboarding around the local-first value loop.
- [ ] Identify one case-study target with real workflow, cache savings, and review-time savings.
- [ ] Define public API stability and v1.0.0 release criteria.

Acceptance:

- [ ] A small team uses the self-hosted product weekly on real work with shared cache savings visible.
- [ ] Managed runtime can start without changing the product architecture.
- [ ] Verification recorded here:

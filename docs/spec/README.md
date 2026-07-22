# spec/ — Requirement Specifications

One file per capability. Each file states **what** the capability does and **why**, as individually
identifiable, testable requirements. The **how** lives in [EXECUTION.md](../EXECUTION.md); the **when** in
[ROADMAP.md](../ROADMAP.md); the laws every requirement must obey in [CONSTITUTION.md](../CONSTITUTION.md).

## ID scheme

| Prefix | Meaning | Lives in |
|---|---|---|
| `PRIN-NN` | Principle (normative law) | [CONSTITUTION.md](../CONSTITUTION.md) |
| `REQ-<AREA>-NN` | Functional requirement | `spec/<area>.md` |
| `NFR-<AREA>-NN` | Non-functional requirement (performance, security, integrity) | `spec/<area>.md` |
| `ADR-NNNN` | Recorded decision | [adr/README.md](../adr/README.md) |
| `M<phase>.<n>` | Milestone | [ROADMAP.md](../ROADMAP.md) / [EXECUTION.md](../EXECUTION.md) |

IDs are **stable**: never renumber, never reuse. A withdrawn requirement keeps its ID with status
`WITHDRAWN` and a note. New requirements take the next free number.

## Requirement format (EARS)

Every requirement uses one of the [EARS](https://alistairmavin.com/ears/) patterns, with the engine (or a
named component) as the actor:

- Ubiquitous — `The <component> shall <behavior>.`
- Event-driven — `When <trigger>, the <component> shall <behavior>.`
- Unwanted behavior — `If <failure/violation>, then the <component> shall <behavior>.`
- State-driven — `While <state>, the <component> shall <behavior>.`

Each requirement block carries its traceability lines:

```markdown
### REQ-CONTRACT-02 — Bounded retry-with-feedback on violation
If output validation fails, then the engine shall re-invoke the Worker with the validation
errors appended as feedback — and only the errors, never a re-inflated copy of the full
context — at most `contract.maxRetries` times, emitting a `Retry` event per attempt.
- **Rationale:** PRIN-05 (delta feedback), PRIN-01 (recorded attempts).
- **Delivered by:** M1.4.
- **Verified by:** _pending_ (test name recorded when written).
```

## Traceability rules

1. Every `REQ`/`NFR` names the milestone(s) that deliver it (`Delivered by:`).
2. Every milestone in ROADMAP.md lists the IDs it delivers (`Delivers:` line).
3. Every acceptance test that verifies a requirement is named on the requirement (`Verified by:`), and the
   test cites the ID in a comment. `_pending_` is legal until the milestone lands, then it must be filled.
4. EXECUTION.md tasks cite the IDs they implement.
5. A requirement with no delivering milestone is a **backlog** requirement — legal, but flagged in its
   status line.

## Status vocabulary

`DRAFT` (content may change) · `STABLE` (change requires noting the affected milestones) ·
`DELIVERED` (all delivering milestones verified) · `WITHDRAWN`.

## Index

| Spec | Prefix | Covers |
|---|---|---|
| [runtime.md](runtime.md) | `REQ-RUNTIME` | Scheduler, parallelism, conditional edges, retries, failure policies, cancellation, resume |
| [control-plane.md](control-plane.md) | `REQ-CTRL` | Durable `wee serve`: restart survival, run controls, settings persistence, progress/liveness |
| [connections.md](connections.md) | `REQ-CONN` | Named non-secret reference bundles: provider + source connections, add/edit/remove, secret lifecycle, forge boundary |
| [definition.md](definition.md) | `REQ-DEF` | Workflow as data: YAML/JSON formats, canonical form, validation |
| [inputs.md](inputs.md) | `REQ-INPUT` | Workflow-level, per-run parameters: declaration, `${input:NAME}` resolution, fail-fast enforcement |
| [workers.md](workers.md) | `REQ-WORKER` | Worker as a role: objective, constraints, tools, policy, contract |
| [contracts.md](contracts.md) | `REQ-CONTRACT` | Output schemas, enforcement, retry-with-feedback |
| [context-policies.md](context-policies.md) | `REQ-CTXPOL` | Context slicing, minimal-by-default, auditability |
| [model-providers.md](model-providers.md) | `REQ-MODEL` | Provider interface, HTTP clients, self-hosted models |
| [cache.md](cache.md) | `REQ-CACHE` | Node cache keys, hits/misses, invalidation |
| [budgets.md](budgets.md) | `REQ-BUDGET` | Cost/token/duration limits, warning and halt |
| [artifacts.md](artifacts.md) | `REQ-ARTIFACT` | Typed artifacts, immutability, content addressing, store |
| [events.md](events.md) | `REQ-EVENT` | Event catalog, append-only log, hash chain, snapshot |
| [replay.md](replay.md) | `REQ-REPLAY` | Audit replay and re-execution |
| [versioning.md](versioning.md) | `REQ-VERSION` | Immutable versions of workflows/workers/contracts/tools |
| [tools.md](tools.md) | `REQ-TOOL` | Tool interface, built-ins, sandboxing |
| [cli.md](cli.md) | `REQ-CLI` | The `wee` binary: commands, output modes, exit codes |
| [sdk.md](sdk.md) | `REQ-SDK` | Go authoring SDK, canonical equivalence |
| [metrics.md](metrics.md) | `REQ-METRIC` | Cost, usage, artifact **value** proxies, savings accounting |
| [security.md](security.md) | `NFR-SEC` | Secrets, sandbox boundaries, integrity guarantees |
| [ui.md](ui.md) | `REQ-UI` | Interface: builder, live execution, timeline, inspector, metrics, templates + UI/UX laws; experience track (theming, tabs, palette, KPIs, onboarding, in-app docs, a11y) |
| [notifications.md](notifications.md) | `REQ-NOTIFY` | Event-derived, local (in-app + browser/OS) run notifications, configurable rules; delivery stays workflow-defined |

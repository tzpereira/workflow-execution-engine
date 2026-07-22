# Roadmap — Workflow Execution Engine

Two phases only.

* **Phase 1 — MVP**: everything needed for practical, trustworthy local workflows and portfolio credibility. Core open source + minimal commercial interface.
* **Phase 2 — Local-First Product**: everything needed for developers and small teams to use WEE weekly from a local or self-hosted service: usability, control, observability, robust execution, safe mutations, and packaging. Hosted operation comes later as a convenience layer over the same product.

Each Phase 1 milestone lists: deliverables, acceptance criteria, dependencies, and a `Delivers:` line naming
the requirement IDs (from [spec/](spec/README.md)) it fulfills. Phase 2 milestones are product-hardening
milestones; when they add or change normative behavior, the corresponding spec IDs must be added before
implementation. The roadmap sequences requirements, it does not restate them. Laws in
[CONSTITUTION.md](CONSTITUTION.md) bind every milestone.

Sequencing rule: **nothing in the Interface starts before the Core event/artifact model is stable** (M1.6). The UI consumes contracts, it never defines them.

---

## PHASE 1 — MVP

Goal: a stranger can `brew install workflow` (or download a single static binary), run a useful workflow
against public source in minutes, understand its result in the UI, replay it for free, and read the code
without embarrassment.

Exit criterion for the whole phase: **three practical read-only templates run end-to-end, code and analysis
outputs are legible without opening raw JSON, and every workflow that can modify a repository pauses for
explicit human approval before the first mutation.**

---

### M1.0 — Foundations & Repo Skeleton

Delivers: no spec REQs — infrastructure; installs the PRIN-04 vocabulary gate and the CI that later REQs verify against.

Deliverables:

* Bilingual monorepo: Go (`core/`, `cli/`, `sdk/` — single Go module) + TypeScript (`ui/`), plus `docs/`, `examples/`, `schemas/` (JSON Schemas as the language-neutral source of truth)
* Go tooling: `golangci-lint`, `gofmt`, `go test` with race detector; TS tooling (ui only): eslint, prettier, vitest
* CI (GitHub Actions): two independent pipelines (Go: lint + vet + test -race; UI: lint + typecheck + test); neither blocks the other
* License decision (Apache-2.0 or MIT for Core)
* ADR (Architecture Decision Records) folder — every irreversible decision gets one, starting with:
  * ADR 0002: language/runtime (Go for Core/CLI/SDK — single static binary, goroutine-native scheduler, git/terraform-grade CLI distribution; TypeScript only in the UI)
  * ADR 0003: serialization format (YAML canonical, JSON equivalent)
  * ADR 0004: content-addressing scheme (SHA-256 over canonical JSON)
  * ADR 0005: contract validation via JSON Schema (draft 2020-12) — language-neutral, replaces any runtime-specific validator
* Naming freeze: Worker, Contract, Artifact, Execution, Event, Workflow. Documented in `docs/glossary.md`.

Acceptance:

* `go test ./... -race` and `pnpm --filter ui test` green in CI on a clean clone.
* Glossary published; no forbidden vocabulary (Prompt, Agent, Chat, Memory) in public APIs.

---

### M1.1 — Domain Model & Serialization

Delivers: REQ-DEF-01..05 · REQ-WORKER-01 (struct+schema) · REQ-ARTIFACT-03 (types) · REQ-EVENT-01 (catalog).

Deliverables:

* Go structs + JSON Schemas (in `schemas/`, the canonical definitions — Go structs mirror them, tested for drift) for every domain object:
  * `Workflow` (id, version, nodes, edges, defaults, budget)
  * `Worker` (id, version, objective, constraints, tools[], contextPolicy, contract, model config)
  * `Contract` (goal, rules[], outputSchema, successCriteria, maxRetries)
  * `ContextPolicy` (enum + params: full | parent-only | artifacts[...] | diff-only | summary | none)
  * `Artifact` (id, type, contentHash, mimeType, metadata, producedBy)
  * `Event` (type, timestamp, executionId, nodeId?, payload)
  * `Execution` (id, workflowRef@version, state, graph snapshot, budget status, timestamps)
  * `Budget` (maxCostUsd, maxTokens, maxDurationMs, maxRetriesPerNode)
* YAML ⇄ JSON ⇄ Go struct round-trip, loss-free
* `workflow validate` logic: JSON Schema validation (`santhosh-tekuri/jsonschema`) + graph validation (no cycles, no orphan nodes, all edges resolve, all referenced artifacts producible)
* Canonical serialization (stable key order; custom JSON marshaler — Go maps don't guarantee order) — prerequisite for hashing/caching

Acceptance:

* Round-trip property tests pass (parse → serialize → parse = identical).
* Invalid workflows produce human-readable, positional error messages (file:line where possible).

---

### M1.2 — Artifact Store & Event Log

Delivers: REQ-ARTIFACT-01..04 · REQ-EVENT-02, REQ-EVENT-04 (snapshot).

Deliverables:

* Local artifact store: content-addressed (`.workflow/artifacts/<sha256>`), immutable, deduplicated
* Artifact types v1: Code, Markdown, JSON, Diff, File, Report, TestResult, Metrics
* Append-only event log per execution (`.workflow/executions/<id>/events.jsonl`)
* Event catalog v1: ExecutionStarted/Finished, WorkerStarted/Finished, ToolCalled/ToolResult, ArtifactCreated, ContractValidated, ContractViolation, Retry, Failure, CacheHit, CacheMiss, BudgetWarning, BudgetExceeded, Cancelled
* Execution record persistence: graph snapshot + config frozen at start (this is what makes audit replay possible)

Acceptance:

* Same content stored twice = one blob.
* An execution directory alone is sufficient to reconstruct the full timeline with zero external state.

---

### M1.3 — Workflow Runtime (Engine)

Delivers: REQ-RUNTIME-01..06 · REQ-WORKER-02 (executor seam) · REQ-BUDGET-01 (halt mechanics), REQ-BUDGET-02.

Deliverables:

* Graph scheduler: topological traversal, dependency resolution
* Parallel execution of independent nodes (goroutines + bounded worker pool; all shared state race-detector-clean)
* Conditional edges (predicate on upstream artifact/JSON path)
* Per-node retry with backoff; distinct handling for: transient errors (retry), contract violations (retry with feedback), fatal errors (fail node)
* Failure policies per node: fail-execution | continue | fallback-node
* Cancellation (SIGINT / API): `context.Context` propagated through every node/tool/model call; graceful, emits Cancelled, persists partial state
* Resumable executions: `--resume <executionId>` restarts from last incomplete node using persisted artifacts
* Budget enforcement hooks: check before each node dispatch and each model call; BudgetWarning at 80%, BudgetExceeded halts

Acceptance:

* Diamond graph (A → B,C → D) executes B and C concurrently; D receives both artifacts.
* Kill mid-execution → resume → completes without re-running finished nodes.
* Budget of $0.01 halts a workflow deterministically with a clear event and exit code.

---

### M1.4 — Workers, Contracts & Model Layer

Delivers: REQ-MODEL-01..05 · REQ-CONTRACT-01..03, REQ-CONTRACT-04 (examples) · REQ-CTXPOL-01..03 (recording) · REQ-WORKER-01..03 (execution) · REQ-BUDGET-03, REQ-BUDGET-01 (real cost) · REQ-EVENT-03 (hash-chain retrofit) · NFR-SEC-01 (provider hygiene), NFR-SEC-02.

Deliverables:

* Model provider abstraction: **Anthropic + OpenAI, both shipped here** (OpenAI is the default — cheaper), each a **hand-rolled `net/http` client** (no vendor SDK — ADR 0006; the official SDKs force a Go 1.24 bump and drag in AWS/GCP/gRPC/OTel/Azure transitively). Vendor types stay isolated behind the `Provider` interface.
* Self-hosted models via the OpenAI client's configurable base URL (REQ-MODEL-04): any OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp server) works with zero engine changes; API key optional for keyless endpoints
* Event log hash-chain retrofit (REQ-EVENT-03, ADR 0007): every event carries the hash of its predecessor; verification routine detects edit/deletion/truncation — done now, before real executions exist to migrate
* Contract compiler: Contract → system/user message construction (this is the ONLY place prompts exist; internal, never exposed)
* Output enforcement pipeline:
  1. parse model output → 2. validate against `outputSchema` (JSON Schema) → 3. on violation, retry with structured validation errors appended → 4. after `maxRetries`, emit ContractViolation + fail node
* Token & cost accounting per call, aggregated per node and per execution
* Context Policy resolver: given policy + execution state, produce exactly the context slice the Worker may see; log what was included (auditable)

Acceptance:

* A Worker with schema `{score: number, issues: string[]}` never yields unvalidated output downstream.
* Forced malformed output (test fixture) triggers retry-with-feedback, visible in events.
* Reviewer with `diff-only` policy demonstrably receives no planning context (assert on compiled context in tests).

---

### M1.5 — Tool Interface & Built-in Tools

Delivers: REQ-TOOL-01..04 · NFR-SEC-03 (threat model v1).

Deliverables:

* Tool interface: `{name, version, inputSchema, outputSchema, execute()}` — schemas make tools cacheable and auditable
* Built-in tools v1:
  * Filesystem (scoped to workspace root, read/write/list)
  * Terminal (allowlist of commands per workflow, timeout, captured stdout/stderr as Artifact)
  * Git (status, diff, add, commit, branch; no push in MVP)
  * HTTP (GET/POST, domain allowlist per workflow)
* Tool sandboxing rules documented (workspace root confinement, command allowlists)
* Tool calls emit ToolCalled/ToolResult events with full payloads

Acceptance:

* Terminal tool running `npm test` produces a TestResult artifact with pass/fail + output.
* Filesystem tool cannot escape workspace root (path traversal tests).

---

### M1.6 — Node Cache (local)

Delivers: REQ-CACHE-01..03, REQ-CACHE-04 (core modes).

Deliverables:

* Cache key = SHA-256 over canonical JSON of: {workerId@version, contractHash, resolved workflow inputs, resolved input artifact hashes, model+params, tool versions, contextPolicy}
* Cache storage reuses artifact store; cache index maps key → artifact set + recorded events
* Cache modes: `--cache=on|off|readonly`
* CacheHit replays the node's recorded artifacts and cost=0 into the new execution
* `workflow cache ls | inspect <key> | clear`
* Invalidation is automatic and total: any input change = new key (no partial/fuzzy matching in MVP)

Acceptance:

* Run flagship demo twice unchanged → second run: 100% cache hits, $0.00, <2s.
* Change one reviewer's contract → only that reviewer + downstream (Fixer, TestRunner, Commit) re-execute.

Milestone gate: **domain model, events and artifacts frozen here. UI work may begin.**

---

### M1.7 — Replay

Delivers: REQ-REPLAY-01..03 (core; CLI surface in M1.9, docs page in M1.15).

Deliverables:

* Audit replay: `workflow replay <id>` — renders recorded execution (timeline, events, artifacts) with zero model calls, zero cost
* Re-execution: `workflow replay <id> --execute` — re-runs with frozen workflow/version/graph/contracts; cache applies
* Divergence report on re-execution: which nodes were cached (identical) vs re-executed (new outputs), side-by-side artifact diff for re-executed nodes
* Docs page: "What replay guarantees (and what it can't)" — the honesty page

Acceptance:

* Audit replay of any past execution works offline.
* Divergence report correctly classifies cached vs fresh nodes.

---

### M1.8 — Versioning

Delivers: REQ-VERSION-01..03 (core; CLI surface in M1.9).

Deliverables:

* Semantic versions on Workflow, Worker, Contract, Tool
* Content-hash pinning: an Execution stores exact hashes, not just version strings
* Immutability rule enforced: editing a definition without bumping version = validation error if hash differs from registry
* `workflow export <name>@<version>` → single portable bundle (workflow + workers + contracts, no secrets)

Acceptance:

* Old executions replay correctly after definitions have moved on.
* Tampered definition with unbumped version is rejected with a clear error.

---

### M1.9 — CLI

Delivers: REQ-CLI-01..04 · NFR-CLI-01 · REQ-CACHE-04 (CLI), REQ-VERSION-03 (CLI), REQ-REPLAY-03 (CLI).

Deliverables:

* Single static binary (cobra for commands): cross-compiled darwin/linux/windows via goreleaser; distribution: GitHub Releases + Homebrew tap + `go install`
* Commands: `run`, `replay`, `inspect`, `validate`, `export`, `cache`, `init` (scaffold), `list`
* `run` flags: `--input`, `--budget`, `--cache`, `--resume`, `--concurrency`, `--json` (machine-readable event stream to stdout)
* Live terminal rendering: per-node status, spinner→check, running cost, cache badges
* `inspect <executionId>`: tree view of graph, per-node cost/tokens/duration, artifact listing, `--node <id>` drill-down
* Exit codes: 0 success, 1 node failure, 2 budget exceeded, 3 validation error, 130 cancelled
* Zero-config start: `workflow init && workflow run examples/hello.yaml` works with only the default provider's key set (`OPENAI_API_KEY`; or `ANTHROPIC_API_KEY` if the workflow selects Anthropic)

Acceptance:

* Feels like git/terraform: static binary, instant startup (<50ms to first output), helpful errors, `--help` everywhere.
* `--json` stream is stable enough for the UI to consume (same event schema).

---

### M1.10 — SDK (Go)

Delivers: REQ-SDK-01..03.

Deliverables:

* Go SDK (same module as the engine — embeds it, no subprocess): `workflow.New`, `workflow.Worker`, `workflow.Contract`, `workflow.Parallel`, `workflow.Merge`, `Run(ctx, ...)`
* SDK compiles to the same canonical format as YAML (no privileged path)
* Programmatic execution API: `exec, err := wf.Run(ctx, opts)`; event subscription via channel: `for ev := range exec.Events()`
* Typed artifact access via generics: `workflow.Artifact[ReviewReport](exec, "reviewerA")`
* Published as Go module; semver from day one
* TypeScript SDK explicitly deferred to Phase 2 (M2.6) — it will generate canonical YAML/JSON consumed by the Go engine

Acceptance:

* Flagship demo expressible in ≤100 lines of SDK code.
* YAML-defined and SDK-defined identical workflows produce identical content hashes.

---

### M1.11 — Interface: Shell & Canvas (React Flow)

Delivers: REQ-UI-01 · `serve` command of REQ-CLI-01.

Deliverables:

* Single-workspace layout: Canvas (center), Inspector (right), Timeline/Logs/Metrics/History (bottom). No page navigation.
* Visual builder: drag-and-drop nodes, edge drawing, node config forms generated from the JSON Schemas in `schemas/` (contracts, policies, budgets) — the same schemas the Go engine validates against, zero drift
* Import/export: reads and writes the Core YAML/JSON directly — byte-stable round-trip, no proprietary format
* Keyboard-first: command palette (⌘K), shortcuts for run/validate/zoom/select
* Design system per UI Philosophy: neutral palette, no gradients, no glassmorphism; Linear/GitHub density

Acceptance:

* A workflow built in UI, exported, runs unmodified via CLI (and vice versa).
* Round-trip does not reorder or reformat user YAML beyond canonicalization.

---

### M1.12 — Interface: Live Execution & Timeline

Delivers: REQ-UI-02.

Deliverables:

* Execution transport: `workflow serve` — the Go binary exposes a local HTTP + WebSocket server streaming the same event schema as `--json`; the UI is a pure client (this same server interface becomes the hosted control plane in Phase 2)
* Live canvas states: queued / running (animated edge flow) / succeeded / failed / cached (distinct badge) / skipped
* Timeline: horizontal per-node bars (Gantt-style), parallel lanes visible, cache hits visually distinct, running cost ticker
* Artifacts appear in real time as produced

Acceptance:

* Flagship demo watched live shows 3 reviewers in parallel lanes, then Fixer, then tests — with zero polling jank.

---

### M1.13 — Interface: Inspector & Artifact Viewer

Delivers: REQ-UI-03, REQ-UI-04 · REQ-CTXPOL-03 (Inspector surface).

Deliverables:

* Inspector (click node): Goal, Contract (rendered, with schema), validation result, resolved context (what the Worker actually saw — the context policy made visible), inputs, outputs, events, retries, cost/tokens/duration
* Artifact viewers: Diff (side-by-side + unified), Markdown (rendered), JSON (tree + raw), Code (syntax highlight), File (download), TestResult (pass/fail summary + logs), Report
* Event log view: filterable by node/type, raw payload expandable
* No modals for primary flows; inspector is a panel

Acceptance:

* Every event type and artifact type has a non-raw rendering.
* "What did this Worker see?" answerable in one click.

---

### M1.14 — Interface: Metrics & Templates

Delivers: REQ-UI-05 · REQ-METRIC-01..03 (local) · REQ-CONTRACT-04 (templates), REQ-CONTRACT-05 (verifier pattern).

Deliverables:

* Metrics panel per execution: total cost, per-node cost breakdown, tokens, duration, cache hit rate, retries, contract violations, failures
* Cross-execution list view: history table with cost/duration/status columns, sortable
* Curated template gallery: PR Review, Test Generator, and Change Risk Analysis as one-click imports
* Template = plain Core bundle from `workflow export` (dogfooding M1.8)

Acceptance:

* New user: open UI → pick template → set API key → run → watch → inspect, in under 5 minutes, no docs.

---

### M1.15 — Product Proof & Practical Workflows

Delivers: NFR-SEC-04 · REQ-REPLAY-03 (honesty page) · REQ-UI-04/05 (product refinement).

Deliverables:

* Three curated, read-only workflows with bounded spend: PR Review, Test Generator, Change Risk Analysis
* Semantic result viewers for review reports, generated code, HTTP responses, and risk analysis; raw JSON remains an explicit fallback
* Cost and token charts by node, plus output-first Inspector disclosure and a reduced workspace tab set
* Advanced mutating workflows remain in `examples/` as source references but are not published in the beginner gallery
* Docs site: quickstart, concepts (one page per domain object), CLI reference, SDK reference, replay-honesty page, cache deep-dive, writing-contracts guide
* Example gallery in repo (`examples/`), each with README + expected cost

Acceptance:

* A first-time user can import and start any published template without cloning the target repository or editing YAML.
* Every published template has at least two visible nodes and no more than two model calls on its main path;
  the analysis and generation templates each have three visible steps.
* Generated code is syntax-highlighted, analysis is charted, and large/raw artifacts stay within bounded scroll regions.

---

### M1.16 — Human-Controlled Mutations

Delivers: REQ-RUNTIME-07 · REQ-UI-06.

Deliverables:

* ADR defining persistent approval checkpoints, event semantics, CLI behavior, and which tool operations count as mutations
* Runtime pause/resume checkpoint before the first filesystem write, terminal mutation, Git mutation, or non-GET HTTP call
* Proposed-change view with formatted diff, affected paths, estimated remaining cost, and explicit Approve/Reject actions
* Approval is the default for mutating workflows; unattended mode requires an explicit workflow or run-level opt-in
* Retry/resume continues from the checkpoint without repeating completed model calls

Acceptance:

* Closing the UI or restarting `wee serve` while approval is pending cannot turn the pause into approval or lose the execution.
* No mutating tool call is emitted before approval; rejection records a terminal, auditable outcome.
* A PR Auto-Fix run can review and propose a patch, pause, show the diff, and continue only after a human approves it.

---

### M1.17 — Release Readiness

Delivers: Phase 1 exit criterion.

Deliverables:

* Top-level README centered on the reliable read-only path, with an unedited product walkthrough
* First-time-user usability pass across install, provider setup, template import, run, inspect, retry, and replay
* Tagged v0.1.0, release binaries, Homebrew tap, published Go module, and launch-post drafts

Acceptance (Phase 1 exit):

* One unedited recording: install → import PR Review → run against a public PR → inspect the semantic result and metrics → replay. Under 5 minutes.
* One unedited mutating-workflow recording demonstrates the persisted human approval checkpoint and contains no unapproved write.
* A senior engineer reading only the README and one example can explain Contracts, Context Policies, Node Cache, and approval checkpoints correctly.

---

## PHASE 2 — LOCAL-FIRST PRODUCT

Goal: a developer or small team can download `wee`, run it locally or self-host it on their own machine/VM, and trust it for real engineering workflows every week. Phase 2 prioritizes product quality before cloud: usability, observability, control, robust execution, safe repository mutation, and packaging. The Core stays open source and self-hostable; hosted operation remains a later convenience layer over the same runtime, never a separate product.

Exit criterion: **a real developer can install WEE, run three practical workflows against public or local repositories, understand outputs/costs/failures without raw JSON, retry/replay safely, and trust any mutating workflow because it pauses for explicit approval before writing.**

---

### M2.0 — UX Reset

Deliverables:

* Replace the remaining boilerplate interface with a developer-tool shell: dense, scan-friendly, stable layout
* Redesign the canvas, Inspector, Timeline, Logs, Metrics, History, Template gallery, Settings, and empty states as one coherent workspace
* Make run setup guided: provider configuration, workflow inputs, budget, cache mode, and workspace root are visible before execution
* Make failures legible at the point of action: node card, timeline row, inspector, and logs all agree on status and cause
* Remove dead UI paths, unused tabs, placeholder components, and examples that do not support the local-first product story

Acceptance:

* First-time user can import a practical workflow, configure inputs/provider/budget, run, inspect, and replay without editing YAML.
* No primary product surface shows unbounded raw JSON by default.
* Responsive desktop and mobile screenshots show no overlapping controls or unreadable primary text.

---

### M2.1 — Output & Observability

Deliverables:

* Semantic viewers for every artifact type: code, diff, markdown/report, JSON tree, HTTP response, test result, metrics, risk/analysis
* Syntax-highlighted code viewer with language detection, copy/download, line wrapping controls, and bounded height
* Diff viewer that makes generated fixes and proposed mutations reviewable before any write
* Charts for cost, tokens, duration, cache hits, retries, failures, contract violations, and savings attribution
* Execution comparison: replay/divergence output visible without leaving the UI
* Logs stay filterable and structured; raw event payloads remain available as an explicit debug fallback

Acceptance:

* A user can answer "what happened, what did it cost, what was reused, and why did this node fail?" from the UI in under one minute.
* Large artifacts stay readable and bounded; no artifact can expand the layout into unusability.

---

### M2.2 — Local Control Plane

Delivers: REQ-CTRL-01..07 · NFR-CTRL-01 (see [spec/control-plane.md](spec/control-plane.md); decision in
[ADR 0012](adr/0012-local-control-plane.md)).

Deliverables:

* `wee serve` becomes a durable local service: executions, artifacts, cache, settings, and workflow catalog survive restarts
* Run controls: start, cancel, retry failed, retry from node, resume, replay, clear cache for workflow/node, export execution bundle
* Budget and cache controls are editable before run and visible during run
* Settings persist reliably: provider keys/references, base URLs, default budget, workspace root, template paths
* Long-running executions surface heartbeats/progress and never look silently stuck

Acceptance:

* Killing and restarting `wee serve` does not lose completed executions, settings, cache index, or pending resumable state.
* Retrying a failed node does not repeat completed upstream work or pay for cached nodes again.

---

### M2.3 — Workflow Authoring & Practical Examples

Deliverables:

* Workflow/Worker/Contract editing becomes practical: validation inline, version bump guidance, schema-aware fields, and safe rollback to previous definitions
* Template gallery expands around real developer jobs: Change/Diff Review, Test Generator, Change Risk, Bug Investigation, Release Notes, Refactor Plan, Dependency Audit
* Each template has guided inputs, expected cost, expected runtime, required tools, and a read-only/mutating safety label
* Change-source adapters stay workflow-defined, not Core-defined: public patch/diff URLs, GitHub PRs, GitLab merge requests, Bitbucket pull requests, local `git diff`, and local files should be expressible with generic HTTP/git/filesystem tools
* Remote public repository workflows work without cloning when the workflow only needs public HTTP data; local workflows work from a checked-out repository without any forge account
* Example READMEs show the intended output, budget profile, and when cache/replay should help

Acceptance:

* A new practical example can be authored, validated, imported, run, replayed, and exported without hand-editing generated UI state.
* Published templates avoid surprise spend and declare whether they can write before a user starts them.
* The published catalog demonstrates at least two change-source shapes, one of which is not GitHub.

---

### M2.4 — Robust Runtime

Deliverables:

* Structured error taxonomy across engine/tools/providers with machine-readable codes and human-readable remediation
* Provider resilience: 429/5xx retry policy, Retry-After support, timeout controls, partial-output handling, and clear provider diagnostics
* Cancellation/resume audit: cancellation propagates through model/tool calls, writes terminal events, and leaves resumable state when possible
* Artifact limits: size quotas, large output streaming, truncation summaries, retention controls, and garbage collection
* Secrets handling hardened: env/keychain references, redaction scans across events/artifacts/cache/export
* Deterministic scheduling audit for reproducible event ordering where completion order is the same

Acceptance:

* A failure caused by rate limits, missing files, provider config, contract violation, timeout, or budget limit points to the exact node and likely fix.
* Soak and stress tests run in CI or scheduled CI without leaks or unbounded storage growth.

---

### M2.5 — Safe Mutations

Deliverables:

* ADR defining persistent approval checkpoints, event semantics, CLI behavior, and which tool operations count as mutations
* Runtime pause/resume checkpoint before filesystem writes, terminal mutations, Git mutations, or non-GET HTTP calls
* Proposed-change view with formatted diff, affected paths, command/API preview, estimated remaining cost, and explicit Approve/Reject actions
* Approval is the default for mutating workflows; unattended mutation requires explicit run-level opt-in
* Change Auto-Fix path: review, propose patch, test, create branch/commit locally, and optionally open a forge PR/MR only through an explicit workflow-defined integration after approval

Acceptance:

* No mutating `ToolCalled` event exists before a matching approval event across normal run, retry, cancellation, and resume.
* Closing the UI or restarting `wee serve` while approval is pending cannot turn the pause into approval or lose the execution.

---

### M2.6 — Self-Hosted Packaging

Deliverables:

* Single-binary install path polished: `wee init`, `wee serve`, `wee run`, `wee inspect`, `wee replay`, `wee cache`
* Docker image and Docker Compose for a small self-hosted service
* Config directory, data directory, migration path, backup/restore commands, and upgrade notes
* CLI output feels like a developer tool: fast startup, helpful `--help`, clear progress, stable `--json`, actionable errors
* Accessibility pass and performance budget: canvas interactive at 200 nodes; event stream remains responsive during large outputs

Acceptance:

* A user can install from release assets or run Docker Compose, start the service, run a template, stop/restart, and keep history/cache intact.
* A senior engineer can understand local/self-hosted operation from README plus one example.

---

### M2.7 — Team Self-Hosted

Deliverables:

* Multi-user self-hosted workspaces with simple auth, API tokens for CLI, and local RBAC: Owner / Editor / Viewer
* Shared execution history, shared node cache, shared template library, and execution links inside the self-hosted instance
* Version comparison for workflows and executions: graph diff, contract diff, divergence view
* Team dashboard: recent executions, cost by workflow/member, cache savings, failure trends
* Audit log: who ran, edited, approved, rejected, shared, or deleted what

Acceptance:

* Member A runs a workflow; Member B's run reuses shared cache where keys match and shows the saved cost.
* An execution link answers "what happened and why" for another team member without a separate explanation.

---

### M2.8 — Managed Runtime Readiness

Deliverables:

* Hosted/managed architecture plan for operating the same self-hosted product: control plane, runners, isolation, key management, retention, billing hooks
* Security baseline for managed operation: dependency scanning, backups, restore drill, data deletion, incident runbook, pen-test plan
* Pricing/onboarding drafts based on the local-first value loop: solo local user → self-hosted team → managed convenience
* Case study target: one real team, real workflow, real numbers for cache savings and review time saved
* Public API stability plan and release criteria for v1.0.0

Acceptance (Phase 2 exit):

* A small team uses the self-hosted product weekly on real work with shared cache savings visible.
* Managed runtime can be started as a business decision without changing the product architecture.

---

## Experience track (M2.9–M2.11)

Added 2026-07-21 (owner decision). These three milestones turn the functional local product into one that is
**inevitable to notice and useful on sight** for a developer, SM, PO, PM, or CTO. They **branch after M2.2
(control plane) and M2.3 (authoring)** and can be pulled forward ahead of M2.4–M2.8 — the dependency graph
below shows the branch. They add normative behavior, so their spec IDs
([connections](spec/connections.md), [notifications](spec/notifications.md),
[ui](spec/ui.md) REQ-UI-07..16 + NFR-UI-01..02) and decisions
([ADR 0013](adr/0013-connections-model.md), [ADR 0014](adr/0014-notifications-model.md),
[ADR 0015](adr/0015-ui-shell-and-visual-system.md)) were written before implementation, per the Phase 2
rule. The Phase 2 exit criterion now also requires the experience track: outputs, costs, failures, and
status must be understandable and pilotable, not merely present.

### M2.9 — Connections & Configuration Experience

Delivers: REQ-CONN-01..06 · NFR-CONN-01 · REQ-UI-16 (see [ADR 0013](adr/0013-connections-model.md)).

Deliverables:

* Connections as named, non-secret reference bundles in workspace settings: add, edit, remove — replacing the hardcoded provider/field list
* Provider connections bound to the existing `Provider` registry: OpenAI (default), Anthropic, and Kimi/Moonshot as an OpenAI-compatible endpoint via base-URL override — no new engine code
* Source connections (GitHub, GitLab, Bitbucket, local repository path, public patch/diff URL) consumed only through generic HTTP/git/filesystem tools; **no forge-specific code in Core**
* "Add connection" surface with presets (base URL, token header shape, typical scopes) as client convenience metadata only
* Secret lifecycle made unambiguous: set/unset badge, **Save** on first set, **Update** once set, **Clear** — never rendering a stored secret value
* Workflows reference connections by id; resolution recorded in the frozen snapshot as references, never secrets

Acceptance:

* A user adds a new model provider (including Kimi) and a non-GitHub source without editing code, and runs a workflow against each.
* No secret value is ever written to settings/snapshot/events/export/logs or rendered in the UI; `core/` contains no forge-named package.

**Depends on:** M2.2, M2.3.

### M2.10 — Professional Shell & Visual System

Delivers: REQ-UI-07..15 · NFR-UI-01, NFR-UI-02 (see [ADR 0015](adr/0015-ui-shell-and-visual-system.md)).

Deliverables:

* Design-token layer (color, elevation, radius, motion, spacing) with light and dark themes (system preference + explicit toggle), both contrast AA
* Expressive-but-disciplined visual language per the amended UI/UX laws: depth, restrained gradients, purposeful motion — Linear/Vercel/Figma standard, never consumer-AI-toy
* Themed dot/grid "whiteboard" canvas; readable initial layout; new nodes never overlap; explicit re-layout action
* Multi-document workspace tabs with a "+" to create/open, per-tab unsaved-edit indicator, and safe close for unsaved/running documents — distinct from execution/run tabs
* Command palette (⌘K) as the interaction spine: icons, shortcut hints, and contextual actions (run, cancel, settings, templates, theme, add connection, jump to node)
* Expand-to-modal editor with markdown for long-text fields, editing the canonical value so content hashes stay byte-stable
* Dashboard-style KPI/observability surface: primary figures prominent, detail behind progressive disclosure, bounded and readable
* One centralized status/signal system: color **and** icon **and** label, color-blind-safe, read from a single module
* Guided first-run onboarding from empty state to first successful run, with in-context concept explainers
* In-app docs/help access, versioned to the running binary
* Accessibility pass (WCAG 2.1 AA) and a performance budget: canvas interactive at 200 nodes, dense surfaces responsive; no silent telemetry

Acceptance:

* A first-time user reaches a first successful run from an empty workspace guided by the UI, in light or dark theme, fully by keyboard.
* Status is legible to a color-blind user; the canvas stays interactive at 200 nodes; screenshots read as a professional developer tool.

**Depends on:** M2.2, M2.3.

### M2.11 — Notifications & Alerts

Delivers: REQ-NOTIFY-01..05 · NFR-NOTIFY-01 (see [ADR 0014](adr/0014-notifications-model.md)).

Deliverables:

* In-app notification center: transient toasts plus a persistent, dismissible list
* Browser/OS notifications (opt-in, permission-gated) for backgrounded tabs, degrading gracefully to the in-app center
* Configurable rules: per-event-type toggles, threshold rules (cost/duration/on-failure), and quiet hours — persisted in settings, no secrets
* All triggers derived from the existing event stream; **no new event type, no writes to the hash-chained log**
* Off-machine delivery (webhook/Slack/email) explicitly left as a workflow-defined integration, never a Core notifier
* Notifications carry status/identifiers/metrics only — never artifact content or secret material

Acceptance:

* A user starts a long run, backgrounds the tab, and is notified on completion/failure per their rules; quiet hours suppress as configured.
* The event catalog and hash chain are unchanged; no notification path in `core/engine` delivers off-machine.

**Depends on:** M2.10 (shell/notification center), M2.2 (event stream).

---

## Dependency Overview

```text
Phase 1:
M1.0 → M1.1 → M1.2 → M1.3 → M1.4 → M1.5 → M1.6 → M1.7 → M1.8 → M1.9 → M1.10
                                            │
                                            └── (freeze) → M1.11 → M1.12 → M1.13 → M1.14 → M1.15 → M1.16 → M1.17

Phase 2 (main line):
M2.0 → M2.1 → M2.2 → M2.3 → M2.4 → M2.5 → M2.6 → M2.7 → M2.8

Experience track (branches after M2.2/M2.3; pull-forward vs M2.4–M2.8):
M2.3 ┬→ M2.9  (Connections)
     └→ M2.10 (Shell / Visual System) → M2.11 (Notifications)
```

---

## Standing Rules (both phases)

1. **Core never depends on the Interface or managed hosting.** Every Phase 2 capability must work locally or self-hosted first.
2. **No feature ships without events.** If it doesn't emit events, it isn't observable, and it doesn't merge.
3. **No definition ships without a version and a hash.**
4. **Every milestone ends with a runnable example**, not a document.
5. **Non-goals stay non-goals** unless a paying user forces the conversation: chat UI, RAG, vector DBs, marketplace, fine-tuning, autonomous long-running loops, model hosting (the binding list lives in [CONSTITUTION.md](CONSTITUTION.md)).

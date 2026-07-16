# Roadmap — Workflow Execution Engine

Two phases only.

* **Phase 1 — MVP**: everything needed for the flagship demo and portfolio credibility. Core open source + minimal commercial interface.
* **Phase 2 — Final Product**: everything needed for teams to pay. Hosted execution, collaboration, hardening.

Each milestone lists: deliverables, acceptance criteria, dependencies, and a `Delivers:` line naming the
requirement IDs (from [spec/](spec/README.md)) it fulfills — the roadmap sequences requirements, it does not
restate them. Laws in [CONSTITUTION.md](CONSTITUTION.md) bind every milestone.

Sequencing rule: **nothing in the Interface starts before the Core event/artifact model is stable** (M1.6). The UI consumes contracts, it never defines them.

---

## PHASE 1 — MVP

Goal: a stranger can `brew install workflow` (or download a single static binary), run the flagship demo on a real repo, watch it live in the UI, replay it for free, and read the code without embarrassment.

Exit criterion for the whole phase: **the 3-minute flagship demo (PR Review & Auto-Fix) runs end-to-end, cached re-runs included, recorded in a single unedited video.**

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

* Cache key = SHA-256 over canonical JSON of: {workerId@version, contractHash, resolved input artifact hashes, model+params, tool versions, contextPolicy}
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

* Single-workspace layout: Canvas (center), Inspector (right), Timeline (bottom), Artifacts/Logs (tabbed in Timeline area). No page navigation.
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
* Template gallery: flagship + 3 secondary demos (Bug Investigation, PRD, Architecture Review) as one-click imports
* Template = plain Core bundle from `workflow export` (dogfooding M1.8)

Acceptance:

* New user: open UI → pick template → set API key → run → watch → inspect, in under 5 minutes, no docs.

---

### M1.15 — Flagship Demo, Docs & Launch

Delivers: NFR-SEC-04 · REQ-REPLAY-03 (honesty page) · Phase 1 exit criterion.

Deliverables:

* Flagship workflow (PR Review & Auto-Fix) polished against 3 real public repos of different sizes
* Docs site: quickstart, concepts (one page per domain object), CLI reference, SDK reference, replay-honesty page, cache deep-dive, writing-contracts guide
* Example gallery in repo (`examples/`), each with README + expected cost
* README with the unedited 3-minute demo video/GIF
* Launch checklist: tagged v0.1.0, binaries released (goreleaser: GitHub Releases + Homebrew tap), Go module published, Show HN / Reddit / X post drafts

Acceptance (Phase 1 exit):

* Unedited video: clone → install → run flagship on real repo → live UI → change one contract → re-run showing cache → audit replay. Under 10 minutes total, flagship under 3.
* A senior engineer reading only the README + one example can explain Contracts, Context Policies and Node Cache correctly.

---

## PHASE 2 — FINAL PRODUCT

Goal: teams pay. Hosted execution, shared cache, collaboration, and the hardening that hosting demands. The Core stays open source and self-hostable; commercial value is in operation and coordination, never in withheld features.

Exit criterion: **a 5-person team uses the hosted product for a real workflow weekly, with shared cache hits across members, and pays for it.**

---

### M2.0 — Core Hardening (pre-hosting prerequisites)

Deliverables:

* Engine long-run stability: soak tests (1k-node graphs, 24h executions), memory profiling, leak fixes
* Deterministic scheduling audit: given same graph + same completion order, identical event sequence
* Structured error taxonomy across engine (machine-readable codes)
* Artifact store: garbage collection with retention policies, size quotas, large-file streaming
* Secrets handling: env/keychain references in definitions, never serialized, redacted in events/exports
* Sandbox upgrade for Terminal tool: container-based execution option (required before running untrusted workflows in cloud)
* Native (non-OpenAI-compatible) local model providers if demand appears — OpenAI-compatible self-hosted endpoints (Ollama, vLLM) already work since M1.4 via REQ-MODEL-04; this covers anything that speaks neither vendor API

Acceptance:

* Soak suite green in CI weekly.
* No secret material can appear in any artifact, event, export, or cache entry (automated scans).

---

### M2.1 — Remote Execution Service (Hosted Runtime)

Deliverables:

* Control plane in Go (evolves `workflow serve` from M1.12): REST + WebSocket API — submit workflow, stream events, fetch artifacts, cancel, resume
* Execution runners: the same static Go binary in minimal containers (scratch/distroless images, ~15MB) pulling jobs from queue; horizontal scaling; per-execution isolation
* Managed API keys option: platform-held provider keys, metered per token with margin (the usage-based revenue line)
* BYO-key mode: encrypted at rest, scoped per workspace
* Server-side budget enforcement (cannot be bypassed by client)
* Execution history retention tiers (free: 7 days; paid: configurable)
* Regions: single region v1; architecture region-aware

Acceptance:

* CLI gains `--remote`: identical UX, identical event stream, execution runs in cloud.
* Isolation test: hostile workflow (fork bombs, network scans, path escapes) contained by sandbox.

---

### M2.2 — Remote Node Cache

Deliverables:

* Remote content-addressed cache, workspace-scoped, layered over local cache (local → remote → miss)
* Team-shared: one member's execution warms everyone's cache (the Tier-1 selling point)
* Integrity: signed cache entries; key includes engine version to prevent cross-version poisoning
* Cache analytics: hit rate per team, $ saved counter (marketing surface in-product)
* Privacy controls: per-node `cache: private` opt-out

Acceptance:

* Member A runs workflow; member B's first run hits ≥ the shared nodes at cost $0 for those nodes.
* "$ saved by cache this month" visible on team dashboard and correct.

---

### M2.3 — Accounts, Workspaces & Billing

Deliverables:

* Auth: email + OAuth (GitHub first — the audience lives there); sessions, API tokens for CLI (`workflow login`)
* Workspace model: personal (free) and team workspaces; members, invitations
* RBAC v1: Owner / Editor / Viewer (Viewer: run + inspect; Editor: modify definitions; Owner: billing + members)
* Billing: Stripe; plans per Business Model — Hosted usage-based + Team per-seat ($15–20); usage dashboards, invoices, spending limits/alerts
* Free tier: local everything forever + limited hosted executions/month (funnel)

Acceptance:

* Full self-serve: sign up → create team → invite → subscribe → run remote, no human involved.
* Downgrade/cancel paths work; data export available on exit (no lock-in).

---

### M2.4 — Collaboration

Deliverables:

* Workflow sharing: private (workspace), link-shared, public
* Execution sharing: read-only links rendering full timeline/inspector/artifacts (respecting artifact redaction rules)
* Version comparison: side-by-side diff of two workflow versions (graph diff + contract diff), and of two executions of the same workflow (divergence view from M1.7 generalized)
* Shared template library per workspace; org-curated templates
* Commenting v1: comments anchored to nodes and executions (no realtime co-editing — explicitly deferred)
* Audit log per workspace (who ran/edited/shared what)

Acceptance:

* An execution link sent to a stakeholder with no account answers "what happened and why" without any explanation call.
* Graph diff correctly highlights added/removed/modified nodes and contract changes.

---

### M2.5 — Interface Maturity

Deliverables:

* Multi-workspace navigation (the one exception to "one workspace": a switcher, not page sprawl)
* Team dashboard: recent executions, cost by workflow/member, cache savings, failure trends
* Advanced timeline: zoom, compare two executions overlaid, filter lanes
* Contract editor upgrades: visual JSON Schema builder, contract test-run against fixture inputs ("dry-run this Worker")
* Workflow-level scheduled runs (cron) and webhook triggers (GitHub PR opened → flagship workflow) — the automation hook that makes it sticky
* Accessibility pass (keyboard-complete, contrast, screen-reader landmarks)
* Performance budget: canvas interactive <1s at 200 nodes

Acceptance:

* GitHub webhook → automatic PR review workflow → result posted back as PR comment (via HTTP tool), fully self-serve setup.

---

### M2.6 — Ecosystem & Extensibility

Deliverables:

* **TypeScript SDK** (deferred from M1.10): authoring-only — generates canonical YAML/JSON executed by the Go engine (via `workflow serve` locally or remote API); typed via codegen from `schemas/`; published to npm
* Custom tool packaging: `workflow tool init` scaffold; native tools as Go plugins/modules, cross-language tools via subprocess protocol (JSON over stdio, schema-validated) — a tool can be written in any language
* Tool registry v1: discoverable list (curated, not a marketplace — marketplace remains a non-goal)
* Plugin points: event sinks (Datadog/OTel exporter, Slack notifier), artifact storage backends (S3), model providers
* OpenTelemetry-native tracing: every execution exportable as OTel traces (observability story for eng orgs)
* Public API stability contract: versioned API, deprecation policy, changelog discipline

Acceptance:

* Third party builds and publishes a working tool (in a non-Go language, via the subprocess protocol) + an OTel exporter using only public docs.
* Flagship demo expressible in the TS SDK; generated YAML hash-identical to the handwritten equivalent.

---

### M2.7 — Reliability, Security & Compliance Baseline

Deliverables:

* SLOs: control plane 99.9%, event stream latency p95 < 500ms; status page
* Backups + disaster recovery runbook (tested restore)
* Security: pen test on hosted platform, dependency scanning, SSO groundwork (SAML deferred to enterprise-later, per non-goals)
* Data controls: workspace data deletion, artifact retention policies, region pinning groundwork
* SOC 2 readiness checklist started (not certification — sequencing: only if enterprise pull is real)

Acceptance:

* Restore drill from backup completes < 1h with zero artifact loss.
* Pen test criticals: zero open.

---

### M2.8 — Launch: Commercial GA

Deliverables:

* Pricing page live matching Business Model tiers
* Onboarding flows: solo dev (local→remote upsell) and team (invite→shared cache aha-moment)
* Case study: one real team, real workflow, real numbers (cache savings, review time saved)
* v1.0.0 of Core: API stability commitment
* Support: docs-first, community (Discord/GitHub Discussions), email for paid

Acceptance (Phase 2 exit):

* ≥1 paying team using it weekly on real work.
* Churn-critical loop verified: run → share → teammate joins → shared cache saves money → renewal.

---

## Dependency Overview

```text
Phase 1:
M1.0 → M1.1 → M1.2 → M1.3 → M1.4 → M1.5 → M1.6 → M1.7 → M1.8 → M1.9 → M1.10
                                            │
                                            └── (freeze) → M1.11 → M1.12 → M1.13 → M1.14 → M1.15

Phase 2:
M2.0 → M2.1 → M2.2 ─┐
        M2.3 ───────┼→ M2.4 → M2.5 → M2.8
        M2.6 (parallel after M2.1)
        M2.7 (parallel, must close before M2.8)
```

---

## Standing Rules (both phases)

1. **Core never depends on the Interface or the cloud.** Every Phase 2 capability must degrade gracefully to local/self-hosted.
2. **No feature ships without events.** If it doesn't emit events, it isn't observable, and it doesn't merge.
3. **No definition ships without a version and a hash.**
4. **Every milestone ends with a runnable example**, not a document.
5. **Non-goals stay non-goals** unless a paying user forces the conversation: chat UI, RAG, vector DBs, marketplace, fine-tuning, autonomous long-running loops, model hosting (the binding list lives in [CONSTITUTION.md](CONSTITUTION.md)).

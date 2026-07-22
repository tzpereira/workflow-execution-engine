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
6. For every owner-requested product/code change, check this playbook before editing code. If the request is
   not covered by the current milestone's goal/tasks/acceptance criteria, propose the exact plan addition
   (or classify it as a narrow bugfix/chore against an already-delivered item) and wait for the owner's
   scope decision before implementation.
7. Update this file as work lands: check tasks, record verification commands, and keep `## Status` current.

## Status

- **M2.4 is complete** (2026-07-22): Robust runtime hardening is implemented and mechanically verified.
  Existing event types now carry structured diagnostics for retries, failures, contract violations,
  budget halts, artifact-store failures, and cache-degraded misses; provider clients honor integer and
  HTTP-date `Retry-After`, expose timeout controls, and reject oversized successful responses rather than
  decoding partial output; artifact storage has default single-artifact and total-directory bounds,
  streaming writes, bounded limit previews, and explicit keep-set garbage collection; a reusable secret
  scanner covers persisted runtime files and exported bundles; long-graph stress coverage guards event and
  artifact growth plus goroutine cleanup. Verified with `go test ./...`, `go test ./... -race`, and
  `go vet ./...`. `golangci-lint run` remains blocked by the pre-existing local typecheck/toolchain
  mismatch already noted in earlier milestones (it reports missing dependency symbols/stale type shapes
  even while `go test`/`go vet` compile cleanly). Next sequential milestone: **M2.5 — Safe Mutations**.
- **M2.10 is implemented pending visual/live walkthrough** (2026-07-22): The UI now has semantic design
  tokens with light/dark theme resolution and an explicit toolbar toggle; shared status/signal mapping;
  themed canvas grid, non-overlapping node placement, and relayout; workspace document tabs with dirty
  state and guarded close; an expanded command palette; long-text canonical modal editing; KPI-first
  metrics; first-run/help surfaces; and focused coverage for status, tabs, palette actions, modal edit
  round-trip, and 200-node relayout. Mechanically verified with UI lint/typecheck/test/build below. A
  real browser keyboard walkthrough plus screenshots remain the only unrecorded acceptance proof if the
  owner wants visual sign-off before closing M2.10.
- **M2.9 is implemented pending live walkthrough** (2026-07-22): Connections now persist as non-secret
  reference bundles in workspace settings; provider connections bind to the existing provider registry
  (Kimi/Moonshot as an OpenAI-compatible provider id, no new provider package); source connections are
  consumed by generic tool inputs via `${connection:id.field}` placeholders; runs record connection
  references in the frozen snapshot and never secret values; the settings UI has an add-connection preset
  surface plus set/unset Save/Update/Clear lifecycle and no longer expands fixed `OPENAI_API_KEY` /
  `ANTHROPIC_API_KEY` / source-token rows before a connection is added. Mechanically verified with Go/UI
  tests below. A real paid Kimi/provider run and a live non-GitHub source walkthrough remain the only
  unrecorded acceptance proof if the owner wants live third-party validation before closing M2.9.
- **M2.3 is complete** (2026-07-22): Worker/Contract editing has real inline validation (server + client)
  and legible version-bump/rollback; the gallery now derives cost/tools/write-capable/guided-inputs
  structurally instead of hand-maintained strings; the catalog demonstrates four change-source shapes
  (GitHub-http, local git-diff, generic patch-URL, local file) via three new templates (`refactor-plan`,
  `release-notes`, `dependency-audit`), each verified end-to-end with a real provider key; GitLab MR/
  Bitbucket PR are documented as the same mechanism rather than built against live third-party APIs. Next
  up per ROADMAP.md's dependency graph: **M2.4 — Robust Runtime** (sequential), or the **experience track
  (M2.9–M2.11)** the owner appended 2026-07-21, which also branches after M2.3 and may be pulled forward —
  the owner picks the order.
- M2.2 is complete: `wee serve` is a durable local control plane — completed executions, persisted settings,
  and the cache index survive a restart; a run left in flight by a killed process is reconciled to
  cancelled-and-resumable on startup (never reported as silently running); and start / cancel / resume /
  retry-from-node / reexecute / clear-cache / export-bundle are exposed over the API and the UI
  (RunControls) with a transport-derived progress + liveness readout. Persistence is in-workspace, progress
  adds no event to the frozen catalog, and settings never store a secret value (ADR 0012, REQ-CTRL-01..07,
  NFR-CTRL-01).
- **Transition decision:** M1.16/M1.17 are superseded for now by this Phase 2 plan. Do not tag a public
  release or start managed hosting work until the local/self-hosted product quality gates here pass.
- **Experience track added (2026-07-21, owner decision):** M2.9 (Connections & Configuration Experience),
  M2.10 (Professional Shell & Visual System), and M2.11 (Notifications & Alerts) were appended with their
  specs ([connections](spec/connections.md), [notifications](spec/notifications.md), ui REQ-UI-07..16) and
  ADRs ([0013](adr/0013-connections-model.md), [0014](adr/0014-notifications-model.md),
  [0015](adr/0015-ui-shell-and-visual-system.md)) written up front. They branch after M2.2/M2.3 and may be
  pulled forward ahead of M2.4–M2.8 — the owner sets the exact order before any of them starts. The current
  milestone is unchanged: **M2.3**.

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

- [x] Define local service persistence: config directory, data directory, execution index, artifact store,
      cache index, settings, and workflow catalog. (In-workspace `.workflow/` — ADR 0012; `settings.json`
      and per-execution `runparams.json` added; executions/artifacts/cache reuse their existing homes; the
      execution index and workflow catalog are derived views, not new stores. No OS config/data-dir split —
      that stays M2.6.)
- [x] Persist settings reliably: provider references/base URLs, default budgets, cache mode, workspace root,
      and template paths. (`core/settings`, atomic temp-then-rename; secret keys stay env-var *references*,
      never values — PRIN-10.)
- [x] Add run controls: start, cancel, retry failed, retry from node, resume, replay, clear cache, export
      execution bundle. (Server-owned run registry + `engine.ResumeFrom`, `cache.Delete`,
      `replay.ExportBundle`; audit-replay is the existing `GET /api/executions/{id}`, re-execution is
      `POST .../reexecute`.)
- [x] Surface long-running execution heartbeats/progress. (Transport-derived: `GET .../progress` +
      RunControls' progress bar and "idle Ns" liveness, folded from the event stream — no persisted
      heartbeat event, owner decision 2026-07-21.)
- [x] Ensure service restart preserves completed executions, resumable state, settings, and cache.
      (`Server.Reconcile()` at serve startup settles interrupted runs to cancelled-and-resumable.)
- [x] Add API and UI tests for retry/resume/cancel/replay flows.
- [x] Multi-execution run tabs: watching or loading a second execution opens it in its own tab
      (`RunTabs.tsx`, `liveStore.ts`) instead of tearing down the first — each tab keeps its own live
      stream, connection state, and audit; switching tabs never stops another tab's stream.
- [x] Settings modal per-field save/clear feedback: each secret field and the durable-settings form report
      saving/saved/failed/cleared/unsaved-changes inline, and the first-save vs. already-set button reads
      Save vs. Replace (REQ-CTRL-05 surfaced; M2.9/REQ-CONN-04 later renames this to Update).

Acceptance:

- [x] Killing and restarting `wee serve` does not lose completed executions, settings, cache index, or
      pending resumable state.
- [x] Retrying a failed node does not repeat completed upstream work or pay for cached nodes again.
- [x] Verification recorded here: `go test ./... -race` (all green — incl. `core/settings`, the
      `core/server` control-plane suite, `engine.TestResumeFromReexecutesNodeAndDownstream`,
      `replay.TestExportBundleContainsSnapshotEventsArtifacts`, `cache.TestDeleteRemovesOnlyNamedKeys`);
      `gofmt`/`go vet` clean on changed files; `pnpm --dir ui lint`; `pnpm --dir ui typecheck`;
      `pnpm --dir ui test` (194 tests, up from 192 with the run-tabs and settings-feedback additions);
      `pnpm --dir ui build` (known Shiki/wasm chunk-size warning only).
      Runnable walkthrough against the real `wee serve` binary: started serve, ran a tool-only workflow to
      `succeeded`, persisted settings, started a second run and hard-killed serve (`kill -9`) mid-run, then
      restarted. After restart — the completed run is still `succeeded`; settings round-trip intact with
      only the env-var NAME on disk (no key value); the interrupted run reconciled to
      `cancelled` / `running:false` (still resumable); `GET .../bundle` returned a valid tar (snapshot +
      events + artifact).

Scope notes (disclosed):

- Per-run budget/cache in the UI are edited as persisted **defaults** in Settings (the server applies them
  via request > settings > default precedence). The raw per-run override fields exist on `POST /api/run`
  for API callers; a dedicated per-run override widget in the run flow was not added.
- The `progress` endpoint's `runningNodes` still lists a node that started but never finished even for a
  reconciled run; the authoritative liveness signal is `running:false` (registry membership), which the UI
  uses to decide control visibility.

---

## M2.3 — Workflow Authoring & Practical Examples

**Goal:** make workflows easier to author and ship examples that feel like real developer jobs.

**Depends on:** M2.2.

Tasks:

- [x] Improve Workflow/Worker/Contract editing with inline validation, version-bump guidance, schema-aware
      fields, and safe rollback. (Server: `handleSaveWorker` now calls `validate.Validate(KindWorker,...)` +
      `validate.CompileSchema` before writing, rejecting an invalid Worker before it reaches disk. Client:
      `WorkerEditor.tsx` reuses the already-installed `@rjsf/validator-ajv8` — no new dependency — for the
      same two-check split, live and debounced, informational only; the server is the enforcement gate. The
      existing M1.8 auto-bump-never-overwrite versioning is now legible: a hint names the exact version Save
      will create, and the version picker shows an objective snippet per version so rollback is informed.
      Visual JSON-Schema-builder UI for `outputSchema` stays out of scope — "schema-aware" means
      validated-against-schema, not a schema-construction UI.)
- [x] Expand practical templates: Change/Diff Review, Test Generator, Change Risk, Bug Investigation,
      Release Notes, Refactor Plan, Dependency Audit. (First four already existed; added `refactor-plan`,
      `release-notes`, `dependency-audit` — each read-only, each a new change-source shape, each verified
      end-to-end with a real provider key.)
- [x] Add guided inputs, expected cost, expected runtime, required tools, and read-only/mutating labels to
      every published template. (`core/registry.DeriveTemplateFacts` derives Tools/WriteCapable/cost/
      duration/Inputs from the canonical Workflow — never a hand-maintained manifest; surfaced in
      `GET /api/templates`, `TemplateGallery.tsx`'s card, and `wee export`'s CLI output, so a CLI-only user
      gets the same declaration.)
- [x] Keep change-source logic out of Core: GitHub PR, GitLab MR, Bitbucket PR, public patch/diff URL,
      local `git diff`, and local file inputs must be represented through generic workflow/tool
      configuration. (Four shapes built concretely — GitHub-http (pre-existing `pr-review`/`change-risk`/
      `test-generator`), local `git diff` (`refactor-plan`), generic public patch/diff URL, no `urlRewrite`
      (`release-notes`), local filesystem read (`dependency-audit`). GitLab MR / Bitbucket PR are
      documented in `examples/README.md` as the same `http` + `urlRewrite` + allowlist mechanism
      `pr-review` already proves, not built as separate live-API templates — a disclosed decision to avoid
      an unverified third-party dependency, PRIN-07 — rather than silently left undemonstrated.)
- [x] Ensure public-remote workflows work without cloning when they only need public HTTP data, and local
      repository workflows work without any forge account. (`pr-review`/`change-risk`/`test-generator`/
      `release-notes` need no clone; `refactor-plan`/`dependency-audit` need no forge account — the `git`
      tool has no push/clone at all.)
- [x] Update example READMEs with intended output, budget profile, and cache/replay behavior. (All three
      new templates' READMEs state this at authoring time; the three existing gallery READMEs
      (`pr-review`/`test-generator`/`change-risk`) retrofitted with the explicit $/token/second figures,
      cross-checked against each `workflow.yaml`'s actual `budget` block.)

Acceptance:

- [x] A new practical example can be authored, validated, imported, run, replayed, and exported without
      hand-editing generated UI state.
- [x] Published templates avoid surprise spend and declare whether they can write before a user starts them.
- [x] The published catalog demonstrates at least two change-source shapes, one of which is not GitHub.
- [x] Verification recorded here: `go test ./... -race` all green throughout (incl. new
      `core/registry.TestDeriveTemplateFacts*` covering the WriteCapable allowlist-polarity classifier and
      the JSON-null-vs-empty-array regression it needed; `core/server`'s new `TestSaveWorkerRejectsSchema
      InvalidWorker`/`TestSaveWorkerRejectsUncompilableOutputSchema`; `examples`' new per-template shape-lock
      tests plus the rewritten `TestPublishedTemplateCatalogIsReadOnly`, which decodes every `.tar` and
      asserts `WriteCapable == false` structurally instead of a hardcoded filename list); `gofmt`/`go vet`
      clean on changed files (golangci-lint itself can't run in this environment — v1.55.2 built against
      Go 1.22 can't read Go 1.26's export data for the standard library, a pre-existing environment
      mismatch unrelated to this milestone). `pnpm --dir ui lint`; `pnpm --dir ui typecheck`; `pnpm --dir ui
      test` (199 tests, up from 194 at M2.2's close — incl. `WorkerEditor.test.tsx`'s new live-validation/
      version-legibility cases and `TemplateGallery.test.tsx`'s new badge/cost/tools/inputs and
      null-drift-defense cases); `pnpm --dir ui build` (known Shiki/wasm chunk-size warning only).
      Manually verified end to end against a real provider key: `refactor-plan` against this repo's own
      uncommitted diff ($0.0004, a bounded 5-step plan); `release-notes` against a real public GitHub
      `.diff` URL ($0.0001, a correct one-line summary for a trivial diff, no invented content);
      `dependency-audit` against this repo's own `go.mod` ($0.0002, three grounded findings, no fabricated
      CVEs). Ran a real `wee serve` and hit `GET /api/templates` directly — caught a real bug live
      (`DeriveTemplateFacts` leaving `Tools`/`Inputs` as nil slices, marshaling to JSON `null` instead of
      `[]`, which `TemplateGallery.tsx`'s `.length` checks would have thrown on) and fixed it at the source
      with a regression test. Replayed `refactor-plan`'s recorded execution at zero cost
      (`wee replay <id>`), confirming per-node cost/tokens/artifact hashes round-trip from the log.

---

## M2.4 — Robust Runtime

**Goal:** make common failures diagnosable, bounded, and recoverable.

**Depends on:** M2.3.

Tasks:

- [x] Define structured error taxonomy across engine, tools, providers, validation, budget, cache, and UI.
- [x] Harden provider behavior: 429/5xx retry policy, Retry-After support, timeout controls, partial-output
      handling, and provider diagnostics.
- [x] Audit cancellation and resume across model calls, tool calls, cache hits, and event persistence.
- [x] Add artifact limits: quotas, large output streaming, truncation summaries, retention controls, and
      garbage collection.
- [x] Harden secrets handling: env/keychain references and automated scans across events, artifacts, cache,
      exports, and error paths.
- [x] Add soak/stress tests for long graphs and long-running executions.

Acceptance:

- [x] Rate limits, missing files, provider config errors, contract violations, timeouts, and budget limits
      point to the exact node and likely fix.
- [x] Soak/stress tests show no leaks or unbounded storage growth.
- [x] Verification recorded here: `go test ./...`; `go test ./... -race`; `go vet ./...` all green.
      Focused coverage added/updated: `diagnostic.TestWrapPreservesCauseAndPayload`,
      `engine.TestRetryOnTransientError`, `engine.TestArtifactLimitFailureNamesNodeAndLikelyFix`,
      `engine.TestCacheHitWithMissingArtifactEmitsDiagnosticMiss`,
      `engine.TestLongGraphStressBoundedEventsAndArtifacts`,
      `store.TestPutRejectsArtifactOverLimitWithSummary`, `store.TestPutRejectsStoreQuota`,
      `store.TestGarbageCollectRemovesUnreferencedArtifacts`,
      `openai.TestRetryAfterHTTPDate`, `anthropic.TestRetryAfterHTTPDate`,
      `openai.TestOversizedSuccessResponseIsRejectedAsPartialOutput`,
      `anthropic.TestOversizedSuccessResponseIsRejectedAsPartialOutput`,
      `security.TestScanFilesForSecretsFindsForbiddenBytes`, and the updated
      `openai.TestNoKeyMaterialInExecutionRecord` bundle/disk scan. `golangci-lint run` was attempted and
      is still blocked by the known local typecheck/toolchain mismatch (same environment class as earlier
      Phase 1/2 notes), unrelated to the M2.4 changes.

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

---

## Experience track (M2.9–M2.11)

> Added 2026-07-21 (owner decision). This track makes the local product **inevitable to notice and useful on
> sight** for a developer, SM, PO, PM, or CTO. It **branches after M2.2/M2.3** and may be pulled forward
> ahead of M2.4–M2.8 (see the ROADMAP dependency graph). Specs and ADRs were written before implementation
> per the Phase 2 rule: [connections](spec/connections.md), [notifications](spec/notifications.md),
> [ui](spec/ui.md) (REQ-UI-07..16 + NFR-UI-01..02); [ADR 0013](adr/0013-connections-model.md),
> [ADR 0014](adr/0014-notifications-model.md), [ADR 0015](adr/0015-ui-shell-and-visual-system.md).

## M2.9 — Connections & Configuration Experience

**Goal:** replace the hardcoded provider/field list with a **Connections** model — add any provider
(including Kimi) and any change source (including non-GitHub) as non-secret reference bundles, with an
unambiguous secret lifecycle, while keeping forges out of Core.

**Depends on:** M2.3.

**Requirements:** REQ-CONN-01..06, NFR-CONN-01, REQ-UI-16 ([spec/connections.md](spec/connections.md),
[spec/ui.md](spec/ui.md)). **Decision:** [ADR 0013](adr/0013-connections-model.md).

Tasks:

- [x] Define the Connection record in `core/settings` (id, label, kind, endpoint/base-URL fields, non-secret
      defaults, secret env/keychain **reference**); persist in `.workflow/settings.json` temp-then-rename
      (NFR-CTRL-01).
- [x] Provider connections bound to the existing `Provider` registry (REQ-MODEL-01); ship Kimi/Moonshot as an
      OpenAI-compatible base-URL preset (REQ-MODEL-04) — **no new provider package**.
- [x] Source connections (GitHub, GitLab, Bitbucket, local repo path, public patch/diff URL) as references
      consumed by the generic HTTP/git/filesystem tools; add an import-boundary test asserting **no
      forge-named package under `core/`**.
- [x] Build the "add connection" surface with presets (base URL, token header shape, typical scopes) as
      client metadata only.
- [x] Secret lifecycle in the settings/connections UI: set/unset badge, **Save** on first set, **Update**
      once set, **Clear**; never read a stored value back into a field/DOM/log. The old always-expanded
      runtime-env list is gone; secret controls now appear only inside configured Connections, and
      workspace root moved to Runtime defaults as non-secret settings.
- [x] Resolve connections by id at run start; record **references** (never secrets) in the frozen snapshot
      (REQ-EVENT-04).
- [x] API + UI tests for add/edit/remove, provider+source resolution, and the never-persist-secret guarantee
      (grep-of-written-files, in the style of `openai.TestNoKeyMaterialInExecutionRecord`).

Acceptance:

- [ ] A user adds a new model provider (including Kimi) and a non-GitHub source without editing code, and
      runs a workflow against each. (Mechanical path verified; live third-party walkthrough not run in this
      session.)
- [x] No secret value reaches settings/snapshot/events/export/logs or the DOM; `core/` contains no
      forge-named package.
- [x] Verification recorded here: `go test ./...`; `go test ./... -race`; `pnpm --dir ui lint`;
      `pnpm --dir ui typecheck`; `pnpm --dir ui test` (200 tests); `pnpm --dir ui build` (known large
      Shiki/wasm chunk warning only). Follow-up UI cleanup verified with `pnpm --dir ui lint`;
      `pnpm --dir ui typecheck`; `pnpm --dir ui test -- SettingsModal`. Not yet run in this pass: a live
      provider/source walkthrough.

## M2.10 — Professional Shell & Visual System

**Goal:** turn the functional interface into a themeable, guided, information-dense, accessible professional
shell that clears the "inevitable / CTO-grade" bar — expressive but disciplined.

**Depends on:** M2.3 (coordinates with M2.9's settings surface).

**Requirements:** REQ-UI-07..15, NFR-UI-01, NFR-UI-02 ([spec/ui.md](spec/ui.md)). **Decision:**
[ADR 0015](adr/0015-ui-shell-and-visual-system.md).

Tasks:

- [x] Introduce the semantic design-token layer (color, elevation, radius, motion, spacing) and light/dark
      themes (system preference + explicit toggle); migrate hardcoded hex and inline neutrals to tokens.
- [x] Apply the amended visual language (expressive, disciplined) within the ADR 0015 guardrails; define the
      elevation/gradient/motion scales.
- [x] Centralize the status/signal system into one module (color + icon + label); replace the ~5 duplicated
      status→color maps.
- [x] Rework the canvas surface (themed dot/grid), fix palette-added-node placement (no overlap), add an
      explicit re-layout action.
- [x] Add multi-document workspace tabs + "+", per-tab unsaved-edit indicator, safe close for
      unsaved/running documents — reconciled with the existing execution/run tabs.
- [x] Enrich the command palette (icons, shortcut hints, contextual run/cancel/settings/templates/theme/add-
      connection/jump-to-node) as the interaction spine.
- [x] Add the expand-to-modal markdown editor for long-text fields, editing the **canonical value** so
      round-trip content hashes stay byte-stable (REQ-UI-01 preserved).
- [x] Build the dashboard-style KPI/observability surface (primary figures prominent, detail behind
      progressive disclosure, bounded).
- [x] Build guided first-run onboarding (empty → first successful run) and keep concept explainers reachable
      in context.
- [x] Add in-app docs/help access, versioned to the running binary.
- [x] Refine Settings/Connections into category accordions instead of one global add-connection select:
      Model providers and Change sources in M2.10, with a Notifications accordion reserved for M2.11.
- [x] Accessibility pass (WCAG 2.1 AA) and performance budget (200-node canvas, dense-surface
      responsiveness); confirm no silent telemetry.
- [x] Tests: token/theme application, status-module single-source, tab state, palette actions, round-trip
      after modal edit, a11y checks.

Acceptance:

- [ ] A first-time user reaches a first successful run from an empty workspace guided by the UI, in light or
      dark theme, fully by keyboard.
- [ ] Status is legible to a color-blind user; the canvas stays interactive at 200 nodes; screenshots read
      as a professional developer tool.
- [x] Verification recorded here: `pnpm --dir ui lint`; `pnpm --dir ui typecheck`; `pnpm --dir ui test`
      (207 tests, up from 199 at M2.3 close and 206 before the 200-node relayout guard);
      `pnpm --dir ui build` (known chunk-size warning only: Shiki/wasm and main bundle). Focused coverage
      includes `status.test.ts`, `store.test.ts`'s workspace-document and 200-node relayout cases,
      `CommandPalette.test.tsx`, and `WorkerEditor.test.tsx`'s canonical modal edit round-trip. Manual
      browser keyboard walkthrough and screenshots are intentionally left unchecked above until recorded.
      Follow-up Settings category refinement verified with `pnpm --dir ui typecheck` and
      `pnpm --dir ui test -- SettingsModal`.

## M2.11 — Notifications & Alerts

**Goal:** tell the user when a run finishes, fails, or crosses a threshold — configurably — without
polluting the hash-chained log or pulling delivery into Core.

**Depends on:** M2.10 (notification center), M2.2 (event stream).

**Requirements:** REQ-NOTIFY-01..05, NFR-NOTIFY-01 ([spec/notifications.md](spec/notifications.md)).
**Decision:** [ADR 0014](adr/0014-notifications-model.md).

Tasks:

- [x] Shell polish carried forward from M2.10 owner review: Settings connection categories stack vertically
      with category-local add controls; Settings closes with Escape and stays keyboard-friendly; command
      palette selected rows remain legible in dark mode; right Inspector and bottom monitor panels are
      resizable plus icon-only minimizable/maximizable with text only in hover/tooltips.
- [x] Manual authoring polish carried forward from owner review: newly-created nodes can be named, switched
      between Worker/Tool shape, pointed at a Worker ref, edited with Tool input JSON, and opened directly
      into Worker/Contract/model editing even before a Worker file exists; model selection is a provider-
      scoped dropdown (including Kimi/Moonshot and saved model-provider Connections) with existing custom
      values preserved as selectable options, and the Worker model controls keep labels stacked above inputs
      instead of crowded inline. Toolbar actions are grouped by workflow order; icon actions have consistent
      height; the theme toggle is icon-only (sun/moon, one at a time) and Help is an info icon, both with
      accessible labels. Canvas MiniMap and zoom/fit controls follow the same light/dark tokens as the main
      shell. Keyboard authoring now includes Cmd/Ctrl+Z undo, Cmd/Ctrl+W add Worker node, and Cmd/Ctrl+T add
      Tool node.
- [x] Fold notification triggers from the existing event stream — **no new event type**, no writes to
      `events.jsonl`.
- [x] Build the in-app notification center (transient toasts + persistent, dismissible list).
- [x] Add browser/OS notifications (opt-in, permission-gated) for backgrounded tabs, degrading gracefully to
      the in-app center.
- [x] Add configurable rules: per-event-type toggles, threshold rules (cost/duration/on-failure), quiet
      hours — persisted in settings (no secrets).
- [x] Enforce redaction: status/identifiers/metrics only; never artifact content or secret material.
- [x] Keep delivery out of Core; document the webhook/Slack/email path as a future workflow-defined
      integration (an HTTP tool node), never a Core notifier.
- [x] Tests: fold-from-events, rules/quiet-hours, permission fallback, redaction, and catalog-unchanged
      (`domain.TestSchemaDrift`).

Acceptance:

- [x] A user backgrounds a long run and is notified on completion/failure per their rules; quiet hours
      suppress as configured.
- [x] The event catalog and hash chain are unchanged; no off-machine delivery path exists in `core/engine`.
- [x] Verification recorded here: shell-polish subset verified with `pnpm --dir ui typecheck` and
      `pnpm --dir ui test -- SettingsModal CommandPalette Timeline App ResizeHandle` (209 tests in the
      selected Vitest run). Notification implementation verified with `go test ./...`; `pnpm --dir ui lint`;
      `pnpm --dir ui typecheck`; `pnpm --dir ui test` (216 tests); `pnpm --dir ui build` (known chunk-size
      warning only). Follow-up manual-authoring polish verified with `pnpm --dir ui lint`;
      `pnpm --dir ui typecheck`; `pnpm --dir ui test` (225 tests); `pnpm --dir ui build` (known chunk-size
      warning only). Browser/OS delivery is verified against an injectable fake Notification API; a manual
      OS permission walkthrough is the remaining optional live/browser proof.

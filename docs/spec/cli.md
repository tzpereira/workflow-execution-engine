# Spec — CLI

**Prefix:** `REQ-CLI` · **Status:** STABLE (delivery M1.9) · **Principles:** PRIN-02, PRIN-05, PRIN-06 ·
**Implementation:** `cli/` (M1.9)

One static Go binary, `wee`, that feels like Git or Terraform: instant startup, everything works from the
terminal, no UI required. The CLI is a pure client of the engine and its event stream.

### REQ-CLI-01 — Command surface
The binary shall provide `run`, `replay`, `inspect`, `validate`, `export`, `cache`, `init`, `list`, and
(M1.12) `serve` — each wrapping its core package, with filled-in help text.
- **Delivered by:** M1.9 (+`serve` in M1.12 — `cli/cmd/serve.go`, wrapping `core/server`; see
  [spec/ui.md](ui.md) REQ-UI-02 and [ADR 0009](../adr/0009-live-event-transport.md)). Note: `export` takes a
  workflow *file*, not a bare `<name>@<version>` — M1.8's registry is in-memory, so there is no persistent
  registry to resolve a bare ref against; the CLI loads the file (+ its Workers) and exports its own
  id@version. **Verified by:** `cmd.TestReplayAuditReadsRecordedRun`, `cmd.TestInspectNodeShowsArtifact`,
  `cmd.TestExportRoundTrips`, `cmd.TestListShowsWorkflowAndExecution`, `cmd.TestCacheClear`,
  `cmd.TestValidateAcceptsGoodWorkflow`, `cmd.TestServeCommandRegistered`,
  `cmd.TestRunStarterExecutesInBackground`.

### REQ-CLI-02 — Zero-config first run
`wee init && wee run examples/hello.yaml` shall work with only the default provider's key in the
environment (`OPENAI_API_KEY`; `ANTHROPIC_API_KEY` if the workflow selects Anthropic; none for a keyless
self-hosted endpoint per REQ-MODEL-04) — no other configuration.
- **Delivered by:** M1.9. `wee init` scaffolds the hello workflow + its Worker; a run needs only the key.
  **Verified by:** `cmd.TestInitScaffoldsRunnableExample` (init's output validates); the model call itself
  needs a live key, so an end-to-end paid run is a manual/CI check, not a unit test.

### REQ-CLI-03 — Dual output: human and machine
`wee run` shall render live per-node status (spinner→check, running cost, cache badges) for humans, and
with `--json` emit line-delimited JSON that matches the event schema exactly — the same stream the UI
consumes; never two sources of truth.
- **Rationale:** PRIN-02; the event stream is the one boundary.
- **Delivered by:** M1.9. Both views consume the same event stream, read from the log via
  `eventlog.ReadAll` (not a second in-memory copy). The human view styles status lines with lipgloss (green
  ✓ / red ✗, a distinct CACHE HIT badge, a running cost) — no full-screen TUI. **Verified by:**
  `cmd.TestRunToolWorkflowSucceeds` (--json lines decode to `domain.Event`, bracketed by ExecutionStarted/
  Finished), `render.TestJSONRendererEmitsValidEventLines`, `render.TestHumanRendererShowsBadgeAndRunningCost`.

### REQ-CLI-04 — Precise exit codes
The binary shall exit `0` on success, `1` on node failure, `2` on budget exceeded, `3` on validation
error, `130` on SIGINT.
- **Delivered by:** M1.9. **Verified by:** `cmd.TestRunToolWorkflowSucceeds` (0),
  `cmd.TestRunUnregisteredWorkerExits1` (1), `cmd.TestRunInvalidWorkflowExits3` (3),
  `cmd.TestRunCancelledExits130` (130, via cancelling the same context SIGINT cancels), and
  `cmd.TestExitForRunMapping` for the budget-exceeded (2) mapping — a real budget trigger needs a priced
  model call, so it is verified at the mapping layer.

### NFR-CLI-01 — Instant startup
`wee --help` shall complete in under 50ms (measured).
- **Delivered by:** M1.9. **Verified by:** `cmd.TestStartupUnder50ms` (builds the real binary, asserts
  best-of-7 under 50ms; measured ~10ms).

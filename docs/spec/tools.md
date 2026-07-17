# Spec — Tool Interface & Built-in Tools

**Prefix:** `REQ-TOOL` · **Status:** STABLE (delivery M1.5) · **Principles:** PRIN-02, PRIN-04, PRIN-10 ·
**Implementation:** `core/tool/` (M1.5)

Workers invoke tools — git, filesystem, terminal, HTTP — through one simple interface. Nothing AI-specific.
Every call is schema-validated and audited; sandboxing is the default, not an option.

### REQ-TOOL-01 — Uniform, schema-validated tool calls
The engine shall invoke every tool through a single interface whose inputs and outputs are
schema-validated; an invalid call is rejected before execution.
- **Delivered by:** M1.5. **Verified by:** `tool.TestInvokeRejectsBadInputBeforeExecute`,
  `TestInvokeRejectsBadOutput`.

### REQ-TOOL-02 — Every call is an event pair
When a tool is invoked, the engine shall emit `ToolCalled` (tool, arguments) and `ToolResult` (outcome,
duration), making tool activity fully reconstructable from the log.
- **Rationale:** PRIN-02; tools are where workflows touch the world — the audit trail matters most here.
- **Delivered by:** M1.5 (`tool.Invoke`, unit-level), M1.6a (wired into the graph via `ToolExecutor`'s
  `ToolEmitter` capability — closing the M1.5 note that `tool.Invoke` was built and tested but never called
  from `core/engine`). **Verified by:** `tool.TestInvokeHappyPathEmitsEventPair`,
  `TestInvokePropagatesExecuteError` (error recorded on `ToolResult`); `engine.TestToolExecutorEmitsEventPair`
  (M1.6a, a real execution's log).

### REQ-TOOL-03 — Sandboxed by default (deny-first)
The engine shall scope the filesystem tool to the execution's working directory, gate the terminal tool
behind a per-workflow command allowlist, and gate the HTTP tool behind a per-workflow domain allowlist; a
request outside the allowlist fails the call with a distinct error — it is never silently attempted.
- **Rationale:** PRIN-10.
- **Delivered by:** M1.5. **Verified by:** `http.TestDisallowedDomainRejected` /
  `TestEmptyAllowlistDeniesAll`, `terminal.TestDisallowedCommandRejected`,
  `filesystem.TestPathTraversalRejected` / `TestSymlinkEscapeRejected`.

### REQ-TOOL-04 — Built-in set for the MVP
The engine shall ship filesystem, terminal, git, and HTTP tools (the set the flagship demo needs); custom
tools implement the same interface.
- **Delivered by:** M1.5 (filesystem, terminal, git, http). **Verified by:** per-tool test suites in
  `core/tool/*`; the flagship demo's Test Runner/Commit nodes wiring terminal/git as real graph nodes lands
  in `examples/` once the tool-backed executor exists (M1.6a); the M1.14 template gallery packages it.

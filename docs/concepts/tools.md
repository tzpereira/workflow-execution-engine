# Tools & sandboxing

Non-normative. The testable rules are [spec/tools.md](../spec/tools.md) (`REQ-TOOL-*`) and
[spec/security.md](../spec/security.md) (`NFR-SEC-*`); the attack surface is [threat-model.md](../threat-model.md).
Implementation: `core/tool/`.

Tools are how a Worker touches the world — read a file, run a test, make a commit, call an API. They are
plain, non-AI-specific software behind one interface, and **sandboxing is the default, not a setting**
(PRIN-10).

## The interface

Every tool implements the same five methods (`core/tool/tool.go`):

```
Name() string
Version() string
InputSchema() []byte      // JSON Schema, draft 2020-12
OutputSchema() []byte     // JSON Schema, draft 2020-12
Execute(ctx, input json.RawMessage) (json.RawMessage, error)
```

`tool.Invoke` runs one call end to end: it validates the input against `InputSchema` (**rejecting before
`Execute` touches anything**), emits `ToolCalled`, runs `Execute`, validates the output against
`OutputSchema`, and emits `ToolResult` — recording the error on `ToolResult` whichever step fails. Because
input and output are schema-checked, tool calls are both auditable and cacheable (M1.6). The event pair
(REQ-TOOL-02) means every touch of the world is reconstructable from the log alone.

## The built-in set

The four tools the flagship demo needs (REQ-TOOL-04). Custom tools implement the same interface.

| Tool | Ops | Sandbox rule |
|---|---|---|
| `filesystem` | read, write, list | confined to a **workspace root**; absolute paths, `..`, and escaping symlinks rejected |
| `terminal` | run a command | `argv[0]` must be on a **per-workflow command allowlist**; runs in the workspace dir under a timeout |
| `git` | status, diff, add, commit, branch | runs in the workspace dir; **no push** — Phase 1 never reaches a remote |
| `http` | GET, POST | host must be on a **per-workflow domain allowlist**; empty allowlist denies everything |

## Sandboxing rules

**Workspace-root confinement (filesystem, git).** Every path resolves against a single root. Absolute inputs
are rejected outright; `.`/`..` are cleaned; symlinks are resolved on the longest existing prefix and the
result must still fall within the (symlink-resolved) root. A path that would escape fails with a distinct
error *before* any I/O — it is never silently followed. git operates only inside the workspace and exposes a
closed set of subcommands, so it cannot reach a remote or run an arbitrary git command.

**Command allowlists (terminal).** Only commands whose `argv[0]` is on the workflow's allowlist run.
Arguments are passed as a list, never concatenated into a shell line, so a call cannot smuggle a second
command through. Each run has a timeout; a non-zero exit is a *captured result* (`passed: false`), while a
disallowed command, a launch failure, or a timeout is a tool *error*. The captured result is stored as a
`test-result` or `file` artifact depending on the tool's configuration.

**Domain allowlists (HTTP).** The request host is taken from the parsed URL and matched against the
allowlist — exactly, or by explicit subdomain suffix (`.example.com`). A disallowed host fails before any
connection is attempted; an empty allowlist denies everything (deny-first).

**Deny-first, always.** Anything outside an allowlist or sandbox boundary fails the call with a clear error.
Silence is never the outcome (REQ-TOOL-03).

## What v1 does not do yet

Documented so operators know the edges (details and milestones in [threat-model.md](../threat-model.md)):
allowlisted terminal commands are not OS-sandboxed (a permitted `sh` can do anything `sh` can), HTTP
redirects are not re-checked per hop against the allowlist, SSRF to link-local/metadata IPs is not filtered,
and definition size/nesting has no explicit limit beyond schema validation. These gate the untrusted-workflow
transition (Phase 2, NFR-SEC-03).

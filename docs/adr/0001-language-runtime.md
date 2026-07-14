# ADR 0001: Language & runtime — Go for Core/CLI/SDK, TypeScript confined to the UI

- **Status:** Accepted
- **Date:** 2026-07-14

## Context

The engine must ship as a single, instantly-starting, cross-platform binary
distributable via `brew install` / `go install` (Git/Terraform-grade), run
independent workflow nodes in parallel with first-class cancellation, and expose
its functionality with no UI dependency (CLI-first, SDK-first). A single
implementation language for Core, CLI, and SDK avoids a serialization boundary
between authoring and execution. See `docs/VISION.md` → "Stack" and "Core
Architecture" for the full rationale.

## Decision

We will implement the Core, CLI, and SDK in **Go**, compiled to a **single
static binary** (`wee`), with a **goroutine-native scheduler** using
`context.Context` for cancellation and deadline propagation. **TypeScript is
confined to the `ui/` project**, which is a pure client over the engine's event
stream (`wee serve`) and never a second source of truth. This yields two
languages with exactly one boundary — Go below the event stream, TypeScript
above it — a boundary that is structurally impossible to violate.

## Consequences

- One artifact to distribute and version; no runtime, interpreter, or container
  required to run a workflow locally.
- Goroutines + `context.Context` map directly onto the runtime's needs (parallel
  nodes, cancellation, resumable executions) without an external orchestrator.
- The SDK imports `core/` in-process (same module) — no subprocess, no wire
  format between authoring and execution.
- The hosted runtime (commercial phase) reuses the identical Go binary in
  distroless containers; the commercial layer never forks the Core.
- Cost: contributing to the engine requires Go; UI contributors need only the
  TypeScript/`ui/` toolchain. The two toolchains are independent (see the two
  separate CI workflows).

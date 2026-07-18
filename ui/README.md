# ui — visual workspace

The workflow engine's visual builder: a single-screen React app that reads and writes the **same
canonical YAML/JSON** the Go engine, CLI, and SDK use — a third door into the same room, never a second
source of truth (PRIN-02, REQ-UI-01).

## Layout

One workspace, no router, no page navigation (VISION "UI Philosophy" — neutral, dense, Linear/GitHub-like):

- **Canvas** (center) — the workflow graph as a React Flow diagram. Drag nodes, draw dependency edges.
- **Inspector** (right) — the selected node's details, or the workflow's metadata and a Budget form
  **generated from `schemas/budget.schema.json`** (the exact file the engine validates against, imported via
  the `@schemas` alias — never hand-copied).
- **Timeline** (bottom) — Timeline / Artifacts / Logs tabs. While a `wee serve` execution is being watched,
  these render live: a Gantt bar per node (parallel lanes, cache hits colored distinctly), a running cost
  ticker, and artifacts/log lines as their events arrive. With no execution watched, Timeline falls back to
  the workflow's static node list.
- **⌘K command palette** — export, validate, add nodes, jump to a node.
- **Live control** (toolbar) — a `wee serve` address field and a Run/Disconnect button. Run posts the
  imported file to `POST /api/run` and watches the returned execution over Server-Sent Events (ADR 0009,
  not WebSocket — the stream is strictly server → client).

## Zero-drift round-trip

Import a Core YAML/JSON workflow, edit it on the canvas, export it back — the definition is semantically
identical, differing only in formatting. Node positions the canvas adds are kept strictly UI-side and never
enter the exported file. This is enforced by tests in `src/core/roundtrip.test.ts`, including the actual
`examples/pr-review/workflow.yaml` the engine ships.

## Develop

```sh
pnpm install
pnpm dev          # Vite dev server
pnpm test         # vitest (round-trip, store, schema, validate)
pnpm typecheck    # tsc -b --noEmit
pnpm build        # tsc -b && vite build
```

## Structure

- `src/core/` — the canonical model, serialization, canvas↔model mapping, structural validation, and the
  live-execution reducer (`live.ts`: events → node status/timeline/cost, framework-free). Pure logic, no
  React, fully unit-tested — the REQ-UI-01/UI-02 heart.
- `src/store.ts` — the zustand workspace store (the graph + meta *is* the workflow being edited).
- `src/liveClient.ts` / `src/liveStore.ts` — the `wee serve` SSE client and the zustand slice wiring it into
  `core/live.ts`'s reducer. A separate store from `store.ts` on purpose: one is the definition being edited,
  the other is a view of an execution happening elsewhere (REQ-UI-02, PRIN-02).
- `src/schemas.ts` — imports and dereferences the engine's JSON Schemas for the @rjsf forms.
- `src/components/` — Canvas, Inspector, Timeline, Toolbar, CommandPalette, WorkflowNode, SchemaForm.

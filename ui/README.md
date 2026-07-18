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
- **Timeline** (bottom) — Timeline / Artifacts / Logs tabs; the live event stream fills these in M1.12.
- **⌘K command palette** — export, validate, add nodes, jump to a node.

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

- `src/core/` — the canonical model, serialization, canvas↔model mapping, and structural validation. Pure
  logic, no React, fully unit-tested — the REQ-UI-01 heart.
- `src/store.ts` — the zustand workspace store (the graph + meta *is* the workflow).
- `src/schemas.ts` — imports and dereferences the engine's JSON Schemas for the @rjsf forms.
- `src/components/` — Canvas, Inspector, Timeline, Toolbar, CommandPalette, WorkflowNode, SchemaForm.

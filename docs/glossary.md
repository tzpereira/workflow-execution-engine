# Glossary

The canonical vocabulary of the Workflow Execution Engine. These terms are the
same ones used in `schemas/`, `core/`, the CLI, and the SDK — definitions here
and names in code must not drift apart.

## Core terms

- **Workflow** — A versioned, serializable graph of Workers and edges that
  defines an executable engineering process. It is the unit of authorship,
  versioning, and execution.
- **Worker** — A node in a Workflow that represents a role. It carries an
  objective, constraints, a set of Tools, a Context Policy, and an output
  Contract, and it produces Artifacts. Workers are interchangeable.
- **Contract** — The enforced specification of a Worker's output: goal, rules, a
  required output schema (JSON Schema draft 2020-12), success criteria, and a
  retry limit. Every output is validated against it; an invalid output triggers
  an automatic retry with the validation error as feedback, and repeated failure
  fails the node explicitly. A Contract is enforced, not merely suggested.
- **ContextPolicy** — The per-Worker declaration of exactly what it is allowed to
  read: full history, parent output only, specific Artifacts, diff only, summary,
  or none. The resolved slice is logged so that what a Worker actually saw is
  auditable.
- **Artifact** — An immutable, content-addressed output produced by a Worker
  (one of: code, markdown, JSON, diff, image, file, report, test-result,
  metrics). Artifacts become inputs to downstream Workers and are the basis of
  the Node Cache.
- **Event** — An immutable, timestamped record of something that happened during
  an Execution (e.g. `WorkerStarted`, `ContractValidated`, `CacheHit`). Events
  form the append-only log that powers replay and observability.
- **Execution** — A single run of a Workflow. It holds state, the resolved graph,
  Artifacts, Events, metrics, costs, Budget status, cache hits/misses, and
  timestamps. Everything in the system revolves around an Execution.
- **Budget** — The declared limits for an Execution: max cost (USD), max tokens,
  max duration, and max retries per node. The runtime enforces them and fails
  fast with a clear Event rather than allowing a silent overrun.
- **Tool** — A sandboxed capability a Worker can invoke (filesystem, terminal,
  git, HTTP, and so on). Every call is schema-validated and emits Events; nothing
  about a Tool is AI-specific.
- **Cache** — The content-addressed Node Cache. A node's cache key is derived
  from the Worker and Contract versions, the resolved input Artifacts, the model
  parameters, the Tool versions, and the Context Policy. When a key matches a
  previous run, the node returns the cached Artifact instead of calling the
  model — free and byte-identical.

## Naming philosophy — forbidden vocabulary

Names are engineering, not decoration. This project uses engineering vocabulary
and avoids AI buzzwords — a discipline that governs the project's own name as
much as the code. The words in the left column below must
**not** appear in `schemas/`, `core/`, `cli/`, `sdk/`, or `docs/` (outside this
table and the planning docs that define the taboo). Use the right column
instead.

| Instead of | Use |
| --- | --- |
| Prompt | Contract |
| Conversation | Execution |
| Chat | Workspace |
| Agent | Worker |
| Memory | Workspace / Artifacts / Context (whichever fits the meaning) |

The rationale is in `docs/VISION.md` → "Naming Philosophy" and "Engineering-first".

**One filename exception:** `AGENTS.md` at the repo root (imported by `CLAUDE.md`). It is not a domain
concept — it's the cross-tool convention coding-agent harnesses (Codex, Cursor, Claude Code) look for at
the repo root. PRIN-04 governs how the project describes itself in `schemas/`, `core/`, `cli/`, `sdk/`,
`docs/`; it does not extend to that filename.

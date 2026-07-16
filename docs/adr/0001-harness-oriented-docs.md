# ADR 0001: Docs structured for coding-agent harness consumption

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

The project's own docs are read cold, repeatedly, by coding agents (and humans) picking up the repo across
sessions — this is exactly the problem harness-design practice addresses: a short, stable entry point plus
progressive disclosure into a versioned system of record, rather than tribal knowledge or an
ever-growing single file (`.claude/skills/agent-harness-design/SKILL.md`, distilled from Anthropic's
"Harness design for long-running application development" and OpenAI's "Alavancando o Codex em um mundo
centrado no agente", both 2026).

Before this decision: the repo had no entry point smaller than the whole `docs/` tree (a cold session had
to discover `CONSTITUTION.md` → `VISION.md` → `spec/` → `ROADMAP.md` → `EXECUTION.md` → `adr/` on its own);
`adr/` had no index while `spec/` did (asymmetric); `VISION.md`'s "Architecture at a glance" was prose only,
no diagram; `ROADMAP.md` had drifted heading levels. None of this was structurally wrong, but none of it
was optimized for being *read cold by an agent*, which is the actual, recurring way this repo gets opened.

## Decision

We will structure the docs explicitly for harness consumption:

- **`AGENTS.md`** at the repo root is the short (~100–150 line budget), stable index — what the project is,
  the reading order (`CONSTITUTION.md` → `VISION.md` → `ARCHITECTURE.md` → `spec/` → `ROADMAP.md` →
  `EXECUTION.md` → `adr/` → `glossary.md`), process laws, and forbidden vocabulary. **`CLAUDE.md` imports
  it (`@AGENTS.md`) rather than duplicating it**, so Claude Code and cross-tool harnesses that look for
  `AGENTS.md` by convention (Codex, Cursor) read the same content.
- **One deliberate, scoped exception to PRIN-04**: the `AGENTS.md` filename itself is not project
  vocabulary — it is the third-party convention a harness expects at the repo root — recorded in
  `glossary.md` so it is never mistaken for drift.
- **`ARCHITECTURE.md`** is the diagram companion to `VISION.md`'s prose — a component map and an
  execution-lifecycle sequence diagram, kept current with `core/` as milestones land (code wins on drift).
- **`adr/README.md`** mirrors `spec/README.md`'s index, closing the one asymmetric gap between the two
  reference directories.
- **`.claude/skills/` is carved out of the otherwise-ignored `.claude/` directory** (`.gitignore`:
  `.claude/*` + `!.claude/skills/`) so harness-design knowledge is versioned and shared, not machine-local.

## Consequences

- **Easier:** a cold session (agent or human) has an O(1) lookup instead of discovering structure by
  reading everything; cross-tool compatibility comes for free (Codex/Cursor already look for `AGENTS.md`);
  the architecture stays visible as a diagram, not just describable in prose.
- **Harder:** `AGENTS.md` is now a maintained surface with an explicit size budget — it must be edited
  back down if it grows past its budget rather than left to accrete; `ARCHITECTURE.md` must be updated in
  the same commit as structural changes to `core/`, or it silently goes stale (mitigated only by review
  discipline, not tooling, for now).
- **Revisit trigger:** if `docs/EXECUTION.md` keeps growing past M1.4 and starts to feel like the "AGENTS.md
  gigante" failure mode the skill warns about, split it into completed/active sections — not done now
  because at 945 lines it isn't there yet.
- This is a process/documentation decision, not a `core/`/`cli/`/`sdk/` architectural one; it doesn't touch
  the Go/TypeScript boundary or any binding interface, but it is recorded as an ADR anyway because it
  establishes a durable repo-wide convention future contributors are expected to follow.

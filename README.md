# Workflow Execution Engine

`wee` — a platform that turns engineering processes into executable, auditable, versioned workflows.

Engineering knowledge today lives in documents, Slack threads, and people's heads. This project turns that
knowledge into software: workflows with source code, versioning, execution, replay, artifacts,
observability, and metrics. **Workflows are software.** LLMs are an implementation detail, not the product
— this is not an AI agent framework, not a chat product, not a prompt builder.

## Why

Tokens got cheaper per unit while agentic tooling exploded the *volume* — total spend went up anyway,
because nothing in the stack is on the side of the user's invoice. This engine is the counterweight: a
governance layer that imposes engineering discipline on models built to spend.

- **The engine owns the loops**, not the model — retries, branching, and merging are deterministic control
  flow, never a model deciding "should I try again?"
- **Context is rationed** by a declared policy per step — the diff, not the repo.
- **Output is contracted** — tight schemas, enforced, not suggested; retries feed back errors, never a
  re-grown transcript.
- **Work is never paid for twice** — content-addressed caching across runs.
- **Spend is fenced** — budgets halt before the next call, not after the invoice.
- **Savings have receipts** — avoided spend is attributed to its cause, auditable from the event log.

## Status

Phase 1 (MVP), milestone M1.13 of M1.15 complete. Not yet released; no stable binary or API.

## Quickstart

Build the CLI and run a workflow — the first one needs no API key:

```sh
go build -o wee ./cli
```

Then follow [docs/TUTORIAL.md](docs/TUTORIAL.md) — a hands-on, copy-pasteable terminal walkthrough (`run`,
`inspect`, `replay`, `cache`, `export`), every command grounded in real output.

## Documentation

Start at [AGENTS.md](AGENTS.md) — the index into the constitution (binding laws), vision (why), specs (what,
as testable requirements), roadmap (when), execution plan (how), ADRs (irreversible decisions), and
glossary. For a runnable terminal walkthrough, see [docs/TUTORIAL.md](docs/TUTORIAL.md).

## License

Apache-2.0. See [LICENSE](LICENSE).

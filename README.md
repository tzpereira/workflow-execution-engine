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

### Running the CLI and UI together

`make dev` builds the CLI, installs the UI's dependencies, and starts `wee serve` (`127.0.0.1:7676`) and the
Vite dev server (`localhost:5173`) together — one Ctrl-C stops both (`make stop` if anything lingers). Put an
`OPENAI_API_KEY=...` (or `ANTHROPIC_API_KEY=...`) in a `.env` file at the repo root first if you want to run
an LLM-backed workflow from the UI — `wee` doesn't read `.env` itself, `make dev` sources it for you.

```sh
make dev                          # --dir defaults to the repo root
make dev DIR=examples/pr-review   # so the UI's Run button resolves files imported from that folder
```

`make build` (CLI only), `make serve` (backend only), and `make ui` (frontend only) are also available — see
the `Makefile` for the full list and overridable variables (`ADDR`, `UI_PORT`, `WORKSPACE`, `DIR`).

## Documentation

Start at [AGENTS.md](AGENTS.md) — the index into the constitution (binding laws), vision (why), specs (what,
as testable requirements), roadmap (when), execution plan (how), ADRs (irreversible decisions), and
glossary. For a runnable terminal walkthrough, see [docs/TUTORIAL.md](docs/TUTORIAL.md).

## License

Apache-2.0. See [LICENSE](LICENSE).

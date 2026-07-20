# CLI Reference

Non-normative. The testable rules are [spec/cli.md](spec/cli.md) (`REQ-CLI-*`). Implementation:
`cli/cmd/*.go`. For a narrative first run, see [TUTORIAL.md](TUTORIAL.md); this page is the flag-by-flag
detail TUTORIAL.md's §9 command table doesn't spell out.

Every subcommand accepts `-h`/`--help`; the text below is that same `--help` output, verbatim, plus the
flags it doesn't restate.

## `wee init`

Creates `.workflow/` (state directory) and an `examples/` folder with a minimal `hello.yaml` and its
Worker. After running it, `wee run examples/hello.yaml` works with only `OPENAI_API_KEY` set. **Existing
files are never overwritten** — safe to run in a directory that already has an `examples/` of its own.

```sh
wee init
```

No flags besides `-h`.

## `wee validate <workflow.yaml>`

Checks a workflow file two ways: against the JSON Schema (shape, required fields, exactly-one-of
`worker`/`tool` per node), then against the graph rules (no cycles, every edge resolves). Problems are
reported with source line numbers.

| Flag | Default | Meaning |
|---|---|---|
| `-h`, `--help` | | help for validate |

**Exit codes:** `0` valid, `3` invalid.

```sh
wee validate examples/hello.yaml
```

## `wee run <workflow.yaml>`

Assembles the engine from the workflow file and its sibling Workers, executes the graph, and streams
events as they happen. With `--json` it emits line-delimited event JSON — the same stream the UI's
WebSocket transport consumes (ADR 0010).

| Flag | Default | Meaning |
|---|---|---|
| `--budget` | `0` | override the workflow's max cost in USD (`0` = use the workflow's own; see [concepts/budget.md](concepts/budget.md) — this can loosen or tighten, no one-way ratchet) |
| `--cache` | `"on"` | cache mode: `on` \| `off` \| `readonly` |
| `--concurrency` | `0` | max nodes to run in parallel (`0` = engine default) |
| `--json` | | emit line-delimited event JSON instead of live status |
| `--resume` | | resume a prior execution by id instead of starting fresh |
| `--workspace` | `".workflow"` | workspace state directory |
| `-h`, `--help` | | help for run |

**Exit codes:** `0` success, `1` node failure, `2` budget exceeded, `3` validation error, `130` SIGINT.

```sh
wee run examples/hello.yaml
wee run workflow.yaml --budget 0.01 --json > run.ndjson
wee run workflow.yaml --resume exec-abc123
```

## `wee list`

Lists workflows in this directory and recorded executions.

| Flag | Default | Meaning |
|---|---|---|
| `--workspace` | `".workflow"` | workspace state directory |
| `-h`, `--help` | | help for list |

```sh
wee list
```

## `wee inspect <executionId>`

Reconstructs an execution from its record and lists each node's state, cost, tokens, and artifact hash.
With `--node <id>` it drills into one node: its duration (from the event timestamps) and the full artifact
content.

| Flag | Default | Meaning |
|---|---|---|
| `--node` | | drill into one node's detail and artifact content |
| `--workspace` | `".workflow"` | workspace state directory |
| `-h`, `--help` | | help for inspect |

```sh
wee inspect exec-abc123
wee inspect exec-abc123 --node reviewer
```

## `wee replay <executionId>`

Two distinct modes, never conflated (see [concepts/execution.md](concepts/execution.md)):

- `wee replay <id>` — **audit**: reconstructs the recorded timeline from disk alone, zero model calls, zero
  cost.
- `wee replay <id> --execute` — **re-execute**: runs the frozen workflow again; unchanged nodes are served
  from cache, only invalidated nodes re-run. Reports which nodes were cached vs. re-executed. A
  re-executed LLM node's output is **not** guaranteed identical — see [replay-honesty.md](replay-honesty.md).

| Flag | Default | Meaning |
|---|---|---|
| `--execute` | | re-execute the frozen workflow instead of auditing |
| `--workflow` | | with `--execute`: workflow file whose sibling Workers to load for any re-executed node |
| `--workspace` | `".workflow"` | workspace state directory |
| `-h`, `--help` | | help for replay |

```sh
wee replay exec-abc123
wee replay exec-abc123 --execute --workflow workflow.yaml
```

## `wee cache`

List, inspect, or clear the node cache — the record of which node outputs can be reused (REQ-CACHE-04). See
[cache-deep-dive.md](cache-deep-dive.md) for what makes a cache key hit or miss.

| Flag | Default | Meaning |
|---|---|---|
| `--workspace` | `".workflow"` | workspace state directory |
| `-h`, `--help` | | help for cache |

Subcommands:

| Subcommand | Does |
|---|---|
| `wee cache ls` | List every cache entry (key, artifact, cost saved) |
| `wee cache inspect <key>` | Show one cache entry's recorded result |
| `wee cache clear` | Remove every cache entry (artifacts in the store are kept) |

```sh
wee cache ls
wee cache clear
```

## `wee export <workflow.yaml>`

Bundles a workflow and every Worker it references into one tar of canonical JSON (ADR 0004), importable
elsewhere with identical content hashes. **Secrets never travel** — definitions carry only `${env:...}`
references, never resolved values. Writes to `<id>-<version>.tar` unless `-o` is given.

| Flag | Default | Meaning |
|---|---|---|
| `-o`, `--output` | `<id>-<version>.tar` | output file |
| `-h`, `--help` | | help for export |

```sh
wee export examples/pr-review/workflow.yaml -o examples/templates/pr-review.tar
```

This is exactly how every bundle under `examples/templates/` was produced — the UI's Template gallery
imports them through the same `wee.yaml`-free path `wee run` already resolves against
(`POST /api/templates/{name}/import`), so an exported bundle needing non-default tools still needs its
`wee.yaml` hand-added after import.

## Related

- [TUTORIAL.md](TUTORIAL.md) — the same commands, in the order a first run actually uses them
- [concepts/](concepts/) — what each noun in this reference (Workflow, Worker, Execution, Budget) means
- [cache-deep-dive.md](cache-deep-dive.md) — `wee cache`'s data model

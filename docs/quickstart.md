# Quickstart

Two paths in, both real, both free until you set a model provider key. Pick one — they read and write the
same files, so switching later costs nothing.

## Path A — terminal

```sh
go build -o wee ./cli
mkdir -p ~/wee-quickstart && cd ~/wee-quickstart
wee init                       # scaffolds .workflow/ and a runnable examples/hello.yaml
export OPENAI_API_KEY=sk-...
wee run examples/hello.yaml
```

For the full walkthrough — validate, cache, replay, export, exit codes, every command grounded in real
output — see [TUTORIAL.md](TUTORIAL.md). Command-by-command detail: [cli-reference.md](cli-reference.md).

## Path B — the visual workspace

```sh
echo "OPENAI_API_KEY=sk-..." > .env   # wee itself never reads .env — make dev sources it for you
make dev                              # builds wee, starts `wee serve` + the UI together
```

Open the URL `make dev` prints, click **Templates**, pick one (the flagship PR-review-and-fix, or one of
three secondary demos), click **Run**, and watch it live — parallel lanes, a running cost ticker, artifacts
filling in as they're produced. Click any node for its Contract, resolved context, and output; the Metrics
and History tabs cover cost/cache/retry numbers per run and across runs. See [ui/README.md](../ui/README.md)
for the UI's own structure, and the [Makefile](../Makefile) for `make serve`/`make ui`/`make stop`
(backend-only, frontend-only, and cleanup).

## Path C — Docker Compose

```sh
docker compose up --build
```

Open `http://localhost:7676`, import a template, and run it. The `wee-data` and `wee-workflows` volumes
preserve history, artifacts, cache, settings, and imported workflows across stop/restart. Backup and upgrade
steps live in [self-hosted.md](self-hosted.md).

## What you just ran

A **Workflow** — a versioned graph of **Worker** and **Tool** nodes. Every Worker's output is validated
against a **Contract** before it becomes an **Artifact**; every Worker sees only what its **Context Policy**
admits; every run is bounded by a **Budget** and recorded as an append-only **Event** log, which is what
made replay, the live UI, and the Metrics panel all possible without a second source of truth. One page per
concept: [concepts/](concepts/).

## Next

- [writing-contracts.md](writing-contracts.md) — design a Contract that resists slop
- [cache-deep-dive.md](cache-deep-dive.md) — why the second run of anything unchanged is free
- [replay-honesty.md](replay-honesty.md) — what audit and re-execution do and do not guarantee
- [self-hosted.md](self-hosted.md) — Docker Compose, persistent paths, backup/restore, upgrades
- [examples/](../examples/README.md) — every shipped template, with expected cost

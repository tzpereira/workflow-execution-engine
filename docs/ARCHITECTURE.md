# Architecture — Workflow Execution Engine

> Non-normative, like [VISION.md](VISION.md), whose "Architecture at a glance" section this expands into
> diagrams. This is the **as-built and as-planned map of the system**, kept current as milestones land —
> when it drifts from `core/`, trust the code and fix this file in the same commit. The binding boundaries
> (Go vs TypeScript, one provider interface, no vendor SDKs, hash-chained log) are ADRs; this file just
> draws them.

## Component map

Two languages, one boundary — Go below the event stream, TypeScript only in `ui/` (ADR 0002). Nodes marked
`✅` exist today (M1.0–M1.11); `▢` are specified but not yet built, tagged with the milestone that delivers
them.

```mermaid
graph TB
    subgraph Authoring["Authoring — three doors, one canonical form (ADR 0003)"]
        YAML["YAML / JSON workflow definition"]
        SDKCode["Go code (sdk/) ✅ M1.10"]
    end

    subgraph Schemas["schemas/ ✅ — JSON Schema draft 2020-12, language-neutral source of truth"]
        SchemaFiles["workflow · worker · contract · context-policy · artifact · event · execution · budget"]
    end

    subgraph Core["core/ — Go, single module, single static binary"]
        Domain["domain ✅ — structs mirroring schemas/"]
        Serialize["serialize ✅ — YAML ⇄ JSON ⇄ struct, loss-free"]
        Canonical["canonical ✅ — deterministic JSON + SHA-256 (ADR 0004)"]
        Validate["validate ✅ — schema validation, positional errors (ADR 0005)"]
        Engine["engine ✅ — scheduler: parallel dispatch, conditional edges,\nretry classes, failure policies, cancellation, resume, budget halt"]
        Contract["contract ✅ M1.4 — compiles Contract → Worker call,\nvalidates output, delta-feedback retry"]
        Policy["policy ✅ M1.4 — resolves each Worker's context slice"]
        Model["model/openai, model/anthropic ✅ M1.4 —\nhand-rolled net/http clients (ADR 0006)"]
        Cost["cost ✅ M1.4 — per-call token/$ accounting"]
        Tool["tool ✅ M1.5 — filesystem, terminal, git, http (sandboxed, PRIN-10);\ntool-backed graph nodes ✅ M1.6a (ADR 0008)"]
        Cache["cache ✅ M1.6 — content-addressed node cache"]
        Replay["replay ✅ M1.7 — zero-cost audit replay + re-execution + divergence"]
        Registry["registry ✅ M1.8 — immutable versioned definitions,\nWorkerSource + hash-pinning + portable export"]
        Store["store ✅ — content-addressed artifact store"]
        EventLog["eventlog ✅ — append-only JSONL, hash-chained (ADR 0007)"]
    end

    subgraph Clients["Clients — no second source of truth"]
        CLI["cli/ ✅ M1.9 — wee binary (run/replay/inspect/validate/export/cache/init/list)"]
        SDKPkg["sdk/ ✅ M1.10 — Go authoring SDK, in-process (builder + Run + typed artifacts)"]
        UI["ui/ ✅ M1.11 — React + TypeScript visual builder;\nlive event stream ▢ M1.12–M1.14"]
    end

    YAML --> Serialize
    SDKCode --> SDKPkg --> Domain
    SchemaFiles -.validates.-> Validate
    SchemaFiles -.mirrors.-> Domain
    Serialize --> Domain
    Domain --> Validate --> Engine
    Domain --> Canonical

    Engine --> Contract --> Validate
    Engine --> Policy
    Engine --> Model
    Engine --> Tool
    Engine --> Cache
    Engine --> Cost
    Engine --> Store
    Engine --> EventLog
    Cache -.keys via.-> Canonical
    Store -.addresses via.-> Canonical
    Registry --> Engine

    EventLog --> Replay
    Store --> Replay
    Replay --> Cache

    CLI --> Engine
    CLI --> Replay
    EventLog -->|"--json"| CLI
    EventLog -->|"wee serve, HTTP/WS"| UI
```

## Execution lifecycle (single node)

What happens once the engine dispatches a Worker — the loop that PRIN-05 (token economy) and PRIN-08
(anti-slop) are enforced inside:

```mermaid
sequenceDiagram
    participant Engine as engine (scheduler)
    participant Policy as policy (context)
    participant Model as model/<provider>
    participant Contract as contract (validate)
    participant Cache as cache
    participant Store as store (artifacts)
    participant Log as eventlog

    Engine->>Cache: cache key ready? (Worker+Contract version, inputs, model params)
    alt cache hit
        Cache-->>Engine: cached artifact
        Engine->>Log: CacheHit
    else cache miss
        Engine->>Log: CacheMiss
        Engine->>Policy: resolve declared context policy
        Policy-->>Engine: minimal slice (never full history by default)
        Engine->>Model: Complete(ctx, messages, params)
        Model-->>Engine: response + token usage
        Engine->>Contract: validate output against outputSchema
        alt invalid
            Contract-->>Engine: validation errors (delta, not re-inflated context)
            Engine->>Model: retry with errors appended (bounded by maxRetries)
            Engine->>Log: Retry
        else valid
            Contract-->>Engine: ok
            Engine->>Store: put artifact (content-addressed)
            Engine->>Log: ContractValidated, ArtifactCreated
        end
    end
    Engine->>Engine: check budget before next dispatch
    Engine->>Log: WorkerFinished
```

## Reading this diagram against the specs

| Diagram element | Governing spec |
|---|---|
| Parallel dispatch, conditional edges, retry classes, failure policy, cancellation, resume | [spec/runtime.md](spec/runtime.md) |
| `contract` compile/validate/retry loop | [spec/contracts.md](spec/contracts.md) |
| `policy` context slicing | [spec/context-policies.md](spec/context-policies.md) |
| `model/*` provider clients | [spec/model-providers.md](spec/model-providers.md), [ADR 0006](adr/0006-model-provider-integration.md) |
| `cache` key + hit/miss/invalidation | [spec/cache.md](spec/cache.md) |
| `cost` accounting | [spec/budgets.md](spec/budgets.md) (REQ-BUDGET-03) |
| `tool` sandboxing | [spec/tools.md](spec/tools.md), [spec/security.md](spec/security.md) |
| `store` / content addressing | [spec/artifacts.md](spec/artifacts.md), [ADR 0004](adr/0004-content-addressing.md) |
| `eventlog` catalog + hash chain | [spec/events.md](spec/events.md), [ADR 0007](adr/0007-event-log-hash-chain.md) |
| `replay` | [spec/replay.md](spec/replay.md) |
| `registry` / versioning | [spec/versioning.md](spec/versioning.md) |
| `cli/`, `sdk/`, `ui/` | [spec/cli.md](spec/cli.md), [spec/sdk.md](spec/sdk.md), [spec/ui.md](spec/ui.md) |

## The flagship graph, for scale

The component map above is the engine; the shape it's built to run well is the flagship demo — see
[VISION.md → Flagship Demo](VISION.md#flagship-demo) for the PR Review & Auto-Fix graph (3 parallel
reviewers, each context-policy-scoped to the diff, feeding a Fixer → Test Runner → Commit). That graph
exercises every box above at once: parallel dispatch, context policies, contract enforcement, cache,
budget, and the event stream the UI renders live.

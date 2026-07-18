# adr/ — Architecture Decision Records

One file per irreversible or contested technical choice — context, the decision in active voice, and its
consequences. Laws live in [../CONSTITUTION.md](../CONSTITUTION.md) (process law: "Decisions live in
ADRs"); a pinned ADR is not re-litigated mid-implementation — changing it takes a new ADR that supersedes
it, never an edit in place.

## Adding one

Copy [0000-template.md](0000-template.md), number it the next free `NNNN`, and fill in exactly one
decision. Reference `docs/VISION.md`/`docs/ROADMAP.md` sections for background rather than restating them.

## Index

| ADR | Decision | Status | Date |
|---|---|---|---|
| [0001](0001-harness-oriented-docs.md) | Docs structured for coding-agent harness consumption (AGENTS.md, ARCHITECTURE.md, adr/ index) | Accepted | 2026-07-15 |
| [0002](0002-language-runtime.md) | Go for Core/CLI/SDK; TypeScript confined to the UI | Accepted | 2026-07-14 |
| [0003](0003-serialization-format.md) | YAML canonical authoring, JSON canonical wire/storage, loss-free round-trip | Accepted | 2026-07-14 |
| [0004](0004-content-addressing.md) | SHA-256 over canonical JSON for artifact and cache keys | Accepted | 2026-07-14 |
| [0005](0005-contract-validation.md) | JSON Schema draft 2020-12 via `santhosh-tekuri/jsonschema/v6` | Accepted | 2026-07-14 |
| [0006](0006-model-provider-integration.md) | Model providers via hand-rolled `net/http` clients, no vendor SDKs | Accepted | 2026-07-15 |
| [0007](0007-event-log-hash-chain.md) | Hash-chained event log (tamper-evident by construction) | Accepted | 2026-07-15 |
| [0008](0008-tool-backed-graph-nodes.md) | Tool-backed graph nodes: Node-level (not Worker-level) extension, optional-interface event bridge | Accepted | 2026-07-17 |
| [0009](0009-live-event-transport.md) | Live event stream over Server-Sent Events (stdlib, zero-dep), not WebSocket | Accepted | 2026-07-18 |

IDs are stable: never renumbered, never reused. A superseded ADR keeps its number and gets `Status:
Superseded by ADR-NNNN` — see [spec/README.md](../spec/README.md) for the project-wide ID scheme (`ADR-NNNN`
alongside `PRIN-NN`, `REQ-*`, `NFR-*`, `M<phase>.<n>`).

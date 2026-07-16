# Constitution — Workflow Execution Engine

> The normative layer. Every spec in [spec/](spec/), every milestone in [ROADMAP.md](ROADMAP.md), and every
> task in [EXECUTION.md](EXECUTION.md) must comply with this document. It changes rarely, and only by an
> explicit, recorded decision (an ADR referencing the principle it amends).
>
> Layering: **CONSTITUTION** (laws) → **VISION** (why / where we're going, non-normative) → **spec/** (what,
> as testable requirements) → **ROADMAP** (when) → **EXECUTION** (how, task by task) → **adr/** (irreversible
> decisions) → **glossary** (ubiquitous language).

---

## Principles

### PRIN-01 — Reproducible & Auditable

LLMs are not deterministic; the platform does not pretend otherwise. What it guarantees instead:

- The **process** is deterministic: same workflow + same version = same graph, same contracts, same
  context policies.
- The **results** are recorded: every output, decision, and artifact is captured immutably.
- Any execution can be **replayed** (re-run with identical configuration) or **audited** (inspected exactly
  as it happened, at zero cost).

Never promise deterministic LLM output. Promise a deterministic process with fully recorded results.

### PRIN-02 — Observable

Every execution tells a story — not just a final answer. Every decision, tool invocation, artifact
creation, dependency, and timing is visible through the event stream. Anything the engine does that is not
observable in events is a defect.

### PRIN-03 — Composable

Small reusable nodes; reusable workflows; reusable contracts; composable tools. Artifacts are the
composition boundary: every node consumes artifacts and produces artifacts.

### PRIN-04 — Engineering-first (the vocabulary law)

Every concept must resemble software engineering: Contracts, Workers, Artifacts, Executions, Graphs,
Events. The forbidden AI vocabulary — `Prompt`, `Agent`, `Chat`, `Memory` — must not appear in `schemas/`,
`core/`, `cli/`, `sdk/`, or `docs/` outside the [glossary](glossary.md)'s "instead-of" table. This applies
to the project's description of itself: it is a **workflow execution engine**, not an "AI agent framework".

### PRIN-05 — Token economy ("every token must justify itself")

Tokens got cheaper per unit while agentic products exploded the *volume* — total spend went up. This engine
is the counterweight:

- **Minimal context by default.** The default context policy is the smallest slice that satisfies the
  node's contract; adding context is an explicit, auditable act. A senior engineer doesn't paste the whole
  repo into a review; neither does the engine.
- **The engine owns the loops, not the model.** Retries, branching, and merging are deterministic engine
  decisions. The model is never asked to decide "should I try again?" — that burns tokens to produce
  control flow the engine already owns.
- **Feedback is delta, not re-inflation.** A retry sends the validation errors — not a re-grown copy of the
  full context.
- **Never pay for the same work twice.** Cache-first: an unchanged node returns its cached artifact.
- Every execution has a budget; every metric includes cost.

### PRIN-06 — Minimalism

Every feature must justify its existence. If it does not improve execution, reproducibility, cost, or
developer experience, it does not belong.

### PRIN-07 — Own the core

Third-party dependencies enter `go.mod` only after a recorded audit (maintainer bus-factor, adoption,
CVEs, transitive weight, license) — see the standing diagnostic in EXECUTION.md §1a and the vetting rule it
encodes. When the surface actually used is small, hand-roll it on the standard library. Precedents:
`tidwall/gjson` dropped for a dotted-path walker; the official Anthropic/OpenAI Go SDKs rejected for
hand-rolled `net/http` clients (ADR 0006). Vendor and transport types never leak past the package that owns
them.

### PRIN-08 — Dense output or nothing (anti-slop)

Schema validation catches malformed output; it does not catch worthless output. Both are rejected:

- Contracts are **tight**: bounded arrays (`maxItems`), bounded strings (`maxLength`), enums over prose.
  Slop loves unbounded lists; contracts deny it the space.
- Verification is a **graph pattern**, not a hope: a cheap verifier node judging an expensive producer node
  against objective criteria is a first-class, documented workflow shape.
- Value is **measured**: artifacts carry proxy value signals (first-pass contract acceptance, downstream
  consumption, cache reuse) so slop shows up in metrics as what it is — cost without consumption.

### PRIN-09 — Tamper-evident by construction

Integrity is structural, not procedural:

- Artifacts are immutable and content-addressed (SHA-256) — a changed artifact is a *different* artifact.
- The event log is append-only and **hash-chained**: every event carries the hash of its predecessor, so
  truncation or edit of history is detectable, not merely forbidden (ADR 0007).
- Executions freeze a snapshot at start; replay reads the record, never a live re-resolution.

### PRIN-10 — Secure by default

- Tools run sandboxed: filesystem scoped to a working directory, terminal behind command allowlists, HTTP
  behind per-workflow domain allowlists. Deny is the default.
- Secrets are referenced (env/keychain), never serialized into definitions, events, exports, or logs.
- Anything that executes untrusted input gets a threat-model entry before it ships.

---

## Process laws

These bind how the project is built (operationalized in [EXECUTION.md](EXECUTION.md) §0):

1. **Milestone-driven, sequentially.** No milestone starts until the previous one's acceptance criteria are
   *verified* — run, seen passing — not merely implemented.
2. **One commit per milestone**, message `M<phase>.<n>: <summary>`. Split only when unusually large.
3. **Never invent scope.** If the specs don't ask for it, it doesn't belong. When in doubt, re-read the
   Non-Goals below.
4. **Decisions live in ADRs.** Irreversible or contested technical choices are recorded in `docs/adr/`
   with context, options, and consequences. A pinned decision is not re-litigated mid-implementation;
   changing it requires a new ADR.
5. **Dependency vetting** (PRIN-07) happens *before* pinning, with sources, and the decision is the
   project owner's — findings and a recommendation are presented, never a unilateral swap.
6. **Traceability.** Requirements carry stable IDs (`REQ-*`, `NFR-*`); milestones declare which IDs they
   deliver; acceptance tests name the IDs they verify (see [spec/README.md](spec/README.md)).

---

## Non-Goals (MVP)

Binding for Phase 1 — these do not shape the architecture:

- Chat interface · RAG · vector databases
- Multi-tenancy · billing · marketplace · team management · enterprise features
- Fine-tuning · AI model hosting · autonomous long-running loops
- Knowledge bases · authentication complexity
- Promising deterministic LLM outputs

They may become integrations later; they must not leak into Phase 1 design.

---

## Amendment record

| Date | Change | Authority |
|---|---|---|
| 2026-07-15 | Initial constitution: PRIN-01..06 extracted from VISION.md Design Principles; PRIN-07..10 added (ownership, anti-slop, integrity, security) with process laws and non-goals consolidated here. | Project owner, session decision |

# Execution Plan — Workflow Execution Engine (Phase 1 / MVP)

> The **how** layer. Laws: [CONSTITUTION.md](CONSTITUTION.md). Requirements (the *what*, as `REQ-*`/`NFR-*`
> IDs): [spec/](spec/README.md). Sequencing: [ROADMAP.md](ROADMAP.md). Tasks below cite the requirement IDs
> they implement; on detail conflicts between prose documents, the **spec** wins, and this file wins on
> operational detail (commands, file paths, order). It covers **Phase 1 only** (M1.0 → M1.15).

## 0. How to use this document (read first)

This is an execution playbook for a coding agent working alone, sequentially, milestone by milestone. It
operationalizes the Process laws of [CONSTITUTION.md](CONSTITUTION.md).

Rules:

1. **Do not skip ahead.** Each milestone lists a "Depends on" line — do not start it until the previous
   milestone's acceptance criteria all pass.
2. **Work top to bottom within a milestone.** Tasks inside a milestone are ordered; later tasks assume
   earlier ones exist.
3. **Check items off as you go.** Edit this file, flip `- [ ]` to `- [x]`, and leave `## Status` (below)
   pointing at the milestone you're currently on. This file is the resumable state of the project — a new
   session should be able to open it cold and know exactly where to pick up.
4. **Do not move to the next milestone until every acceptance criterion in the current one is verified**,
   not just implemented. Run the verification command, see it pass, then check the box.
5. **Commit each logical unit of work as it lands**, not the whole milestone squashed into one commit. A
   commit corresponds to one coherent piece — a package, a bug fix, a doc pass — never a milestone-wide
   diff and never a file-by-file trickle. Prefix milestone-scoped commits `M1.X: <summary>` (e.g. `M1.3:
   goroutine-based scheduler with retries and cancellation`); an incidental fix or chore uncovered along
   the way gets its own conventional prefix (`fix:`, `chore:`) instead. Where feasible, verify each commit
   builds (and its own tests pass) standalone before moving to the next — a plain `git stash -u` of
   everything else in the working tree is enough to check this without a branch per commit. The
   milestone-acceptance gate (rule 4 above) still applies before starting the *next* milestone, not before
   each commit inside this one.
6. **Never invent scope.** If ROADMAP.md/VISION.md don't ask for it, it doesn't belong in Phase 1. When in
   doubt, re-read the "Explicit Non-Goals" section of VISION.md before adding anything.
7. Where a concrete technical choice was left open by ROADMAP.md, it is pinned in §1 below (with the
   irreversible ones recorded as ADRs). Use that choice; do not re-litigate it mid-implementation.
8. **Close the traceability loop.** Tasks cite the `REQ-*`/`NFR-*` IDs they implement (see
   [spec/README.md](spec/README.md)). When a milestone's acceptance tests pass, fill in the corresponding
   `Verified by:` lines in the spec files (replacing `_pending_` with the real test names) in the same
   commit.

## Status

- **Current milestone:** M1.6a — complete, locally verified. Next up: M1.7. **Milestone gate reached at
  M1.6:** the domain model, event catalog, and artifact model are frozen, with M1.6a recorded as its one
  disclosed, narrow exception (`domain.Node` only — `domain.Worker`/`worker.schema.json` untouched).
- **Docs migrated to spec-driven format (2026-07-15):** normative laws now live in
  [CONSTITUTION.md](CONSTITUTION.md) (PRIN-01..10); testable requirements with stable IDs in
  [spec/](spec/README.md); VISION.md is non-normative. M1.4 additionally absorbed two decisions:
  self-hosted models via configurable base URL (REQ-MODEL-04) and the event-log hash-chain retrofit
  (REQ-EVENT-03, ADR 0007).
- **M1.0:** complete and locally verified. One acceptance criterion stays open until the branch is pushed:
  "Both GitHub Actions workflows are green on the PR/commit that introduces them" needs GitHub to run
  Actions. Every command those workflows run passes locally. The M1.0–M1.3 commits are all unpushed; once
  pushed and both workflows show green, check that box.
- **M1.1:** all tasks and acceptance criteria verified locally (`go test ./core/... -race` green, including
  schema-drift and round-trip; unresolved-edge and cycle errors carry the offending id and source line).
- **M1.2:** all tasks and acceptance criteria verified locally (identical content dedupes to one file;
  an execution directory alone reconstructs the ordered timeline, incl. a concurrent-Put race test).
- **M1.3:** all tasks and acceptance criteria verified locally — diamond runs B/C concurrently, cancel→resume
  skips finished nodes, a $0.01 budget halts with a distinct error. Conditional edges use a hand-rolled
  dotted-path evaluator (gjson dropped, see §1a); retry/failure-policy/cancellation covered by tests, incl. a
  goroutine-leak check.
- **M1.4:** all tasks and acceptance criteria verified locally (`go test ./... -race` green; `go vet` and
  `golangci-lint` v1.55.2 clean). Workers now call real providers behind one `Provider` interface (OpenAI
  default, base-URL-configurable for Ollama/vLLM; Anthropic); vendor types provably confined to their
  package (`core/model` isolation test); output enforced against `contract.outputSchema` with bounded,
  delta-feedback retries (contract retries counted separately from transient ones); context policies resolve
  the minimal slice and record admitted hashes; real per-call cost feeds the budget; the event log is
  hash-chained and tamper-evident. Notes: (1) the `NodeExecutor` seam took a `NodeRequest{Node, Inputs,
  RetryFeedback}` so contract-violation feedback can flow back into the executor without cross-attempt state;
  (2) the chain hashes raw line bytes (catches unknown-field injection), and tail-truncation detection is
  explicitly deferred to external anchoring (ADR 0007); (3) fixed a latent M1.3 scheduler race — a
  parent-cancelled run could finalize as `failed` if an in-flight node returned its cancellation before the
  coordinator observed `ctx.Done()`; cancellation is now deterministic (`cancelHalt`). Local test runs use
  `CGO_ENABLED=0` to sidestep a macOS-only cgo/`net` linker quirk (`missing LC_UUID`); Linux CI is unaffected.
- **M1.5:** all tasks and acceptance criteria verified locally (`go test ./... -race` green; `go vet` and
  `golangci-lint` v1.55.2 clean). Workers touch the world only through the sandboxed `tool.Tool` interface:
  `tool.Invoke` schema-validates input (rejecting before `Execute` runs), emits the `ToolCalled`/`ToolResult`
  pair, and schema-validates output. Four built-ins — filesystem (workspace-root confined; rejects absolute,
  `..`, and escaping symlinks), terminal (command allowlist + timeout, result as test-result/file artifact),
  git (status/diff/add/commit/branch, **no push**), http (domain allowlist, deny-first). Threat model v1
  shipped (`docs/threat-model.md`, NFR-SEC-03) with the residual gaps that gate untrusted definitions
  (Phase 2). Not built this milestone: a tool-backed `NodeExecutor` wiring tools into graph nodes — the tasks
  and acceptance criteria are tool-level; graph integration lands with the flagship template (M1.14), and
  `tool.Invoke` already takes the scheduler's emitter so that wiring is a thin layer when it comes.
- **M1.6:** all tasks and acceptance criteria verified locally (`go test ./... -race` green; `go vet` and
  `golangci-lint` v1.55.2 clean). The node cache (`core/cache`) keys each node on worker version, contract
  hash, resolved input-artifact hashes, model+params, tool names, and context policy; the engine checks it
  before dispatch and, on a hit, returns the recorded artifact byte-identically at `$0` (skipping the model),
  else records the entry after a successful run. Modes `on|off|readonly` thread through `RunOptions.Cache`.
  Re-running unchanged is 100% hits at `$0`; changing one node re-executes only its downstream cone.
  Decisions worth noting: (1) cache hits **reconstruct** events fresh rather than replaying a stored stream —
  a verbatim stream would carry a stale executionID and break the new log's hash chain (ADR 0007), so an
  entry records the node result, not an event log; (2) `cache.Key` takes an `Inputs` struct, not the awkward
  positional signature sketched in the task, carrying model+params faithfully as a `domain.ModelConfig`;
  (3) tool "versions" in the key are the Worker's tool **names** until tools are actually invoked by the
  executor (M1.14) — changing the allowlist still invalidates the key. Cache reuses `core/store` for bytes,
  so nothing is stored twice.
- **Milestone gate (M1.6):** the domain model, event catalog, and artifact model are now **frozen**. UI work
  (M1.11+) may begin in parallel; the default path still finishes M1.7–M1.10 first.
- **M1.6a:** all tasks and acceptance criteria verified locally (`go test -race ./...` green; `go vet` clean;
  `golangci-lint` could not be run — see note below). Closes a pre-existing gap `spec/workers.md`'s
  REQ-WORKER-02 already anticipated ("tool-backed... executors") without any milestone delivering it:
  `domain.Node` gains an optional `Tool *ToolCall` (exactly one of `Worker`/`Tool` required, enforced in
  `core/validate/graph.go`); `domain.Worker`/`worker.schema.json` are untouched (a disclosed, narrow
  exception to the M1.6 freeze, scoped to `Node` only — see [ADR 0008](adr/0008-tool-backed-graph-nodes.md)).
  A new `ToolExecutor` runs a tool-backed node deterministically (no model ever shapes its input, ADR 0006);
  a new `DispatchExecutor` composes it with `WorkerExecutor` behind `Scheduler`'s one `exec` field, routing
  each node by kind. Tool-input placeholders (`${nodeID.path}` for upstream artifacts, `${env:NAME}` for
  secrets) reuse the existing dotted-path walker — zero new parsing library. Tool-backed nodes never cache
  (`DispatchExecutor.CacheKey` returns `ok=false` unconditionally for them) — a Tool is opaque to the engine,
  which cannot verify its `Execute` doesn't read ambient state. `ToolCalled`/`ToolResult` reach the log via a
  new `ToolEmitter` capability mirroring `CacheKeyer` exactly — a per-call closure parameter, never a mutated
  field on the executor the scheduler's goroutine pool calls concurrently (verified race-clean).
  Notes: (1) found only while writing the NFR-SEC-01 e2e test, not anticipated by the ADR: a resolved
  `${env:...}` secret can leak through a third path beyond events and error text — the resulting artifact
  content itself, since a tool's real output can legitimately echo back what it was given (e.g. `curl -v`'s
  stderr); redaction now covers `NodeResult.Content` too, before `core/store` ever writes it — the
  already-committed ADR/spec wording was corrected to match once this was found; (2) the `examples/github-pr-review`
  example surfaced a latent design bug before it shipped: a URL or header built from *multiple* embedded
  placeholders (owner/repo/PR-number concatenated, or `"Bearer ${env:TOKEN}"`) silently fails to resolve,
  since placeholders are whole-string-only by design — fixed by requiring one fully precomposed value per
  field, documented in both the example and `spec/workers.md`'s REQ-WORKER-06. **Environment note:** Homebrew
  silently upgraded the system `go` to 1.26.5 mid-session, incompatible with the CI-pinned `golangci-lint`
  v1.55.2 (built against go1.22.12; its export-data reader can't parse the newer compiler's output) — `go
  build`/`go vet`/`go test -race` all stayed clean throughout; only the local lint run was affected. Not
  something this milestone caused or attempted to fix (touches global Homebrew tooling — a deliberate call
  for the project owner, not a silent workaround); re-verify with `golangci-lint` once resolved.
- **Phase 1 exit criterion:** not met.

(Update this section every time you finish a milestone.)

---

## 1. Pinned technical decisions

These resolve every "TBD" left in ROADMAP.md. Use them as-is.

| Decision | Choice |
|---|---|
| Go module path | `github.com/tzpereira/workflow-execution-engine` (single module, matches `git remote`) |
| License | Apache-2.0 (patent grant; standard for dev-infra tooling) |
| Binary name | `wee` |
| JSON Schema validator (Go) | `github.com/santhosh-tekuri/jsonschema/v6` (draft 2020-12) — resolved 2026-07-14, was `/v5`; see §1a |
| YAML library (Go) | `gopkg.in/yaml.v3` |
| CLI framework | `github.com/spf13/cobra` |
| Terminal styling | `github.com/charmbracelet/lipgloss` (no full TUI framework — MVP doesn't need it) |
| Model provider integration | hand-rolled HTTP client on `net/http` — Anthropic + OpenAI, **OpenAI default** (cheaper); resolved 2026-07-14, official vendor SDKs rejected after audit; see §1a |
| JSON-path predicate evaluation (conditional edges) | hand-rolled dotted-path evaluator on `encoding/json` (resolved 2026-07-14, dropped `tidwall/gjson`; see §1a) |
| Cross-compile / release | `goreleaser` (`.goreleaser.yaml` at repo root) |
| UI scaffold | Vite + React + TypeScript |
| UI package manager | `pnpm` |
| UI styling | Tailwind CSS, neutral palette (see VISION.md "UI Philosophy") |
| Visual graph editor | `@xyflow/react` (React Flow) |
| Schema-driven forms | `@rjsf/core` + `@rjsf/validator-ajv8` |
| Command palette | `cmdk` |
| UI state | `zustand` (no Redux — avoid unneeded ceremony) |
| Code/diff/syntax rendering | `shiki` (code highlight), `react-diff-view` (diffs) |
| UI test stack | `vitest` + `@testing-library/react` |

Repository layout (final, at the end of Phase 1):

```text
workflow-execution-engine/
├── go.mod                     # single module: core + cli + sdk
├── core/
│   ├── domain/                # structs mirroring schemas/*.json
│   ├── serialize/             # YAML <-> JSON <-> Go struct
│   ├── canonical/              # stable-key-order JSON marshaling (hashing prerequisite)
│   ├── validate/               # schema validation + graph validation
│   ├── store/                  # content-addressed artifact store
│   ├── eventlog/                # append-only JSONL event log
│   ├── engine/                  # scheduler, retries, cancellation, resume, budget
│   ├── model/                   # provider interface + anthropic/ + openai/ (hand-rolled HTTP clients)
│   ├── contract/                 # contract compiler + output enforcement
│   ├── cost/                      # token/cost accounting
│   ├── policy/                     # context policy resolver (NOT named "context" — collides with stdlib)
│   ├── tool/                        # tool interface + filesystem/, terminal/, git/, http/
│   ├── cache/                        # cache key, store, index
│   ├── replay/                        # audit replay + re-execution + divergence report
│   ├── registry/                       # versioning, immutability, export
│   └── server/                          # `wee serve` HTTP + WebSocket transport
├── cli/                        # cobra command definitions (imports core/)
├── sdk/                        # Go authoring SDK (imports core/, same module)
├── schemas/                    # canonical JSON Schemas (draft 2020-12)
├── docs/
│   ├── adr/
│   ├── concepts/
│   ├── glossary.md
│   └── replay-honesty.md
├── examples/
├── ui/                         # separate pnpm/TS project
└── .github/workflows/
```

> Note on CLI sequencing: ROADMAP.md references CLI commands (`workflow validate`, `workflow cache ls`,
> `workflow replay`, `workflow export`) inside milestones M1.1–M1.8, but the `cli/` package and `wee` binary
> are not built until M1.9. Resolve this by treating M1.1–M1.8 as building **core library functions with
> their own tests** (`go test`, not the binary). M1.9 is a single pass that wires every one of those
> functions to a cobra subcommand. Do not build a throwaway CLI earlier — there's nothing to gain from it.

---

## 1a. Dependency risk diagnostic (addendum — 2026-07-14)

Prompted by a concern about over-relying on third-party Go libraries — specifically after noticing that
`spf13/cobra`'s README carries a commercial sponsorship banner from Warp. This is a documentation-only
addendum: **no pin in §1 was changed as a result.** Each library below was checked for maintainer bus-factor,
real-world adoption, maintenance activity, known CVEs (GitHub Advisory Database + [OSV.dev](https://osv.dev)),
license, and viable alternatives. Where hand-rolling is a realistic option, that's called out explicitly.

> **Resolved 2026-07-14:** the project owner chose to pin **`/v6`** (was `/v5`). §1's pin and M1.1's
> `core/validate/schema.go` task text were updated to match; ADR `0005-contract-validation.md` records the
> rationale. The diagnostic below is retained as-is for provenance — read "v5" references in it as the
> pre-decision state.

### `santhosh-tekuri/jsonschema/v5` — Verdict: **Keep** (but see the v5-vs-v6 note below)

- Maintainer: solo (Santhosh Kumar Tekuri) — 99 commits vs. the next-highest contributor's 3. Bus-factor of 1,
  no GitHub Sponsors profile, no `FUNDING.yml`. Apache-2.0 licensed, so forking/vendoring is unrestricted if
  it's ever abandoned.
- **Important nuance for the exact pin in §1:** the `v5` module line (branch `master`) has had **no commits
  since 2024-05-03** — over two years frozen. Development moved to a `v6` module
  (`github.com/santhosh-tekuri/jsonschema/v6`, active through 2026-06-28), but even v6 hasn't had a tagged
  release since `v6.0.2` in May 2025 (14+ months), prompting an unanswered [complaint
  issue](https://github.com/santhosh-tekuri/jsonschema/issues/256) from a user in April 2026. v5 being frozen
  isn't necessarily bad — draft 2020-12 itself is stable and v5 passes the full JSON-Schema-Test-Suite — but
  it means "last commit 2026-06-28" (true of the repo) is misleading for what's actually pinned; the version
  in §1 hasn't been touched in 2+ years.
- Adoption: 1,241 stars, ~2,100 dependent repos and ~1,237 dependent packages per [GitHub's dependents
  graph](https://github.com/santhosh-tekuri/jsonschema/network/dependents). Confirmed by directly reading
  `go.mod` files (not just search summaries): **Kong** (API gateway) depends on `v5.3.1` **directly — the exact
  version pinned here**; Helm, `kubeconform`, and `golangci-lint` all depend on `v6.0.2` directly. Notably,
  **Helm migrated to this library specifically to fix a security bug**: its prior dependency
  `xeipuuv/gojsonschema` had unsafe `$ref` resolution that let a malicious Helm chart schema trigger an
  OOM DoS (`CVE-2025-55199`); Helm's fix in 3.18.5 was switching to `santhosh-tekuri/jsonschema/v6` — a real
  point in favor of this library's security design, not just its popularity.
- Maintenance overall (repo-wide, including v6): last push 2026-06-28. License Apache-2.0, not archived. It
  remains the only mature, fully spec-compliant **draft 2020-12** Go validator with real adoption —
  `qri-io/jsonschema` tops out at 2019-09 (last real commit 2021, effectively stale) and
  `xeipuuv/gojsonschema` at draft-7 (functionally abandoned since 2020, and is the library whose `$ref`
  handling caused the Helm CVE above) — neither is a real substitute given the project needs 2020-12.
- CVEs: none against the library itself, confirmed three ways —
  [OSV.dev](https://osv.dev) (empty result), [GitHub Advisory Database](https://github.com/advisories?query=santhosh-tekuri)
  (zero advisories), and [Snyk](https://security.snyk.io/package/golang/github.com%2Fsanthosh-tekuri%2Fjsonschema%2Fv5)
  ("no direct vulnerabilities found"). One thing to watch: a fresh, unpatched [open issue
  #261](https://github.com/santhosh-tekuri/jsonschema/issues/261) (filed 2026-07-10) reports that oversized
  JSON numbers get converted to unbounded `big.Rat` values during validation — a possible resource-exhaustion
  vector, not yet fixed as of this check.
- Alternatives considered:
  - `kaptinlin/jsonschema` — also supports draft 2020-12 as its default dialect, actively maintained (last
    commit 2026-07-05), but only 225 stars — much less real-world adoption to derisk it than tekuri's.
  - **`google/jsonschema-go`** (module `github.com/google/jsonschema-go/jsonschema`) — new as of January 2026,
    announced on the [Google Open Source blog](https://opensource.googleblog.com/2026/01/a-json-schema-package-for-go.html).
    Google states it's "already a critical dependency for Google's own AI SDKs" and the official Go MCP SDK,
    which is a strong institutional-backing signal — but it's ~6 months old at time of writing, unproven at
    scale, and its own announcement is oriented around schema *inference* from Go structs (a feature this
    project doesn't need), not validator maturity. Worth re-evaluating at a later milestone once it has a track
    record; not mature enough to switch to now.
  - Hand-rolling a full 2020-12 validator in-house is not worth considering — the spec covers `$ref`/`$dynamicRef`
    resolution, format vocabularies, and hundreds of edge cases in the official test suite. That's a
    multi-month undertaking to reinvent something already correct and unencumbered.
- **Secondary open item (lower stakes than the gjson question — same author/library either way):** consider
  pinning `v6` instead of `v5` when M1.1 actually scaffolds `core/validate/schema.go` — v6 is where bug fixes
  land now and is what Helm/kubeconform/golangci-lint actually run, even though it hasn't tagged a release in
  14+ months either. v5 is frozen but stable and zero-CVE, so staying on it is defensible too. Not urgent to
  decide today.

### `tidwall/gjson` — Verdict: **Hand-roll recommended** → **RESOLVED 2026-07-14: dropped, hand-rolled**

> **Resolved 2026-07-14 (during M1.3):** the project owner chose to hand-roll. `tidwall/gjson` was never
> added to `go.mod`; `core/engine/conditional.go` evaluates conditional-edge predicates with a small
> dotted-path walker over `encoding/json` (a structured `{path, op, value}` predicate on the domain `Edge`).
> §1's pin and the M1.3 task text were updated to match. The diagnostic below is kept for provenance.

- Maintainer: Josh Baker (tidwall), solo — 282 of 321 commits on master (~88%) are his; the next-most-active
  contributor has 3 commits. gjson's own runtime deps (`tidwall/match`, `tidwall/pretty`) are maintained by the
  same one person — a real single-point-of-failure, not just "mostly one person" ([contributors
  graph](https://github.com/tidwall/gjson/graphs/contributors)). No corporate backing: no `FUNDING.yml`, and
  `github.com/sponsors/tidwall` 302-redirects (no live Sponsors page).
- Adoption: 15,542 stars, ~10,420 known importers per
  [pkg.go.dev](https://pkg.go.dev/github.com/tidwall/gjson?tab=importedby). Confirmed live in `go.mod` for
  Traefik, Grafana, Grafana k6, Argo Workflows, OpenShift Hive, KubeVela, and Zalando Skipper — genuinely
  widely used, "many eyes on it" holds.
- Maintenance: bursty, not steady — a ~19-month gap (Oct 2024 → May 2026) preceded the current `v1.19.0`
  (2026-05-08). No formal GitHub Releases are published, only git tags.
- CVEs: 4 historical, all DoS-class (crafted-JSON panics fixed ≤v1.6.6; a ReDoS via crafted path fixed in
  v1.9.3) — [OSV.dev](https://osv.dev). **More importantly, two security-relevant issues are open and
  unaddressed right now**, not just historical: [#391](https://github.com/tidwall/gjson/issues/391) (stack
  overflow DoS, `@dig` memory amplification, `Parse()` info disclosure — filed 2026-02-23) and
  [#393](https://github.com/tidwall/gjson/issues/393) (`ForEach`/`Get` disagree on duplicate object keys — a
  parser-smuggling-style vector — filed 2026-05-09). Neither has a maintainer reply or fix as of 2026-07-14,
  despite commit activity in that same window — security reports specifically aren't being prioritized even
  when routine maintenance happens. This supersedes the "clean since 2021" framing an earlier pass of this
  research gave — the current state is not clean, it's quiet.
- Alternatives considered: `ohler55/ojg` (full JSONPath, actively maintained — 952 stars, commits through
  2026-07-05, 0 open issues — the most credible drop-in if a library is still wanted), `itchyny/gojq` (jq-style
  query language, actively maintained, but a much heavier dependency for this use case), `PaesslerAG/jsonpath`
  (ruled out — stale, no commits since mid-2024).
- ROADMAP.md's actual spec for this feature (§ Phase 1, "Conditional edges") says only *"predicate on upstream
  artifact/JSON path"* — no wildcard, filter-query (`#()`), or modifier syntax is called for. That confirms the
  narrow-use-case assumption below rather than just assuming it.
- **Recommendation:** hand-roll. The real requirement (`core/engine/conditional.go`, per M1.3) is a dotted-path
  lookup into an artifact's JSON plus a scalar comparison — buildable on `encoding/json` alone
  (`json.Unmarshal` to `any`, walk `strings.Split(path, ".")` through maps/slices, type-switch the comparison)
  in well under 100 lines. That removes a solo-maintained dependency with two currently-open, unaddressed
  security issues, in exchange for code built directly on the stdlib's own hardened JSON parser — a net
  security improvement, not just a simplification, for a feature this narrow. The one thing to verify before
  cutting the dependency: confirm no workflow spec anywhere actually needs gjson's wildcard/array-query syntax
  (`*`, `?`, `#(...)`) — ROADMAP.md as written doesn't ask for it, but re-check if that changes. **Decision
  still deferred to project owner** — say the word and this pin + the M1.3 task text get updated to drop the
  dependency.

### `spf13/cobra` — Verdict: **Keep**

- Maintainer: not solo — [MAINTAINERS](https://github.com/spf13/cobra/blob/main/MAINTAINERS) lists 4 active
  (spf13, johnSchnake, jpmcb, marckhouzam) plus 7 marked inactive. Marc Khouzam is also a Helm maintainer and
  works at VMware by Broadcom; Steve Francia's history runs MongoDB → Docker → Google (Go language product
  lead) → currently Two Sigma. Not foundation-hosted (lives under the personal `spf13` namespace), but a real
  multi-person team, not a bus-factor-of-1 situation.
- Adoption: 44,273 stars ([repo](https://github.com/spf13/cobra)); confirmed live (not just claimed) in the
  `go.mod`/`vendor.mod` of Kubernetes/kubectl, Hugo, Docker CLI, GitHub CLI, and Helm — all five pinned to
  `v1.10.2` — about as "too big to fail" as a Go dependency gets.
- Maintenance: last push 2026-07-11, latest release `v1.10.2` (2025-12-04), 2–4 releases/year with continuous
  unreleased commit activity between them. License: Apache-2.0.
- CVEs: none ([OSV.dev](https://osv.dev) query returns zero results; zero hits in the official Go
  vulnerability database too).
- Institutional backing: Cobra + Viper were selected for GitHub's inaugural **Secure Open Source Fund**
  (announced [Aug 19, 2025](https://spf13.com/p/cobra-viper-fortify-security-as-part-of-github-secure-open-source-fund/)),
  a real, credentialed security-hardening investment — this is a positive signal for bus-factor, not a red
  flag.

**Warp/Cobra fact-check** (the specific claim that triggered this review): **true, but overstated** —
independently verified twice (direct fetch of the raw README, plus a second, independent research pass that
reached the same conclusion): the live `spf13/cobra` README does contain a literal "Supported by: Warp, the
AI terminal for devs" banner linking to `warp.dev/cobra`, deliberately placed by spf13 himself (commit history
shows him repositioning it in May 2025 and updating the logo in Aug 2025) — this is not vandalism or a stray
edit. That said:
- It's a **README ad-banner placement**, not a financial-control relationship. Warp does **not** appear on
  [`github.com/sponsors/spf13`](https://github.com/sponsors/spf13) (featured sponsor there is Datadog; others
  include AWS and GitHub's own Secure Open Source Fund), there's no `FUNDING.yml` entry for Warp (404 on
  direct fetch), and the `warp.dev/cobra` link itself resolves to Warp's **generic homepage** — no
  Cobra-specific case study or partnership content exists there.
- No technical or personnel tie exists: Warp the terminal is written in Rust (confirmed via Warp's own
  engineering blog), shares no code with Cobra, and no Cobra maintainer is employed by Warp.
- Likely source of the confusion: Warp's *own* open-source repo (`warpdotdev/warp`) names **OpenAI** as its
  founding sponsor — a fact about Warp-the-company that's easy to conflate with "Warp sponsors Cobra" if
  skimmed out of context, which matches how the claim arrived bundled with generic Warp company/funding
  background in the original message.
- Net effect: accurate as a bare claim, but reads as marketing copy dressed up as a technical/financial
  backing relationship. It doesn't imply Warp has any influence over Cobra's direction, maintenance, or
  roadmap — not a supply-chain risk signal on its own.

### `charmbracelet/lipgloss` — Verdict: **Keep**

- Maintainer: Charm Inc., a funded company ($6M seed, Nov 2023, led by Google's Gradient Ventures — see
  [TechCrunch](https://techcrunch.com/2023/11/02/charm-offensive-googles-gradient-backs-this-startup-to-bring-more-pizzazz-to-the-command-line/)),
  not a solo hobbyist. Lipgloss itself has 46 contributors with commits spread across several named engineers
  — not a single-point-of-failure.
- Adoption: 11,557 stars ([repo](https://github.com/charmbracelet/lipgloss)); used in production by `gh-dash`,
  `chezmoi`, AWS's `eks-node-viewer`, and Microsoft's `Aztify`; Ollama's CLI is mid-migration onto it.
- Maintenance: last push 2026-07-13, latest release `v2.0.5` (2026-07-03), roughly monthly patch cadence since
  the v2.0.0 major. License: MIT.
- CVEs: none for lipgloss itself ([OSV.dev](https://osv.dev) and [GitHub Advisories](https://github.com/advisories?query=lipgloss)
  both empty). A sibling Charm project (`soft-serve`) did have one past advisory — noted here only to show the
  org discloses/patches responsibly when issues do arise, not as a mark against lipgloss.

### Model provider SDKs (`anthropics/anthropic-sdk-go`, `openai/openai-go`) — Verdict: **Rejected → hand-rolled HTTP**

> **Resolved 2026-07-14 (planning M1.4):** the project owner initially leaned toward the official vendor SDKs
> for a "top-tier" feel, then asked for this audit before pinning. The audit surfaced a hard blocker plus heavy
> transitive bloat; decision reversed to a **hand-rolled `net/http` client per provider**, with vendor types
> isolated behind `core/model`'s `Provider` interface. §1's pin and the M1.4 task text were updated to match.

- **Hard blocker — Go version wall.** `anthropics/anthropic-sdk-go` v1.57.0 (latest, 2026-07-10) declares
  `go 1.24` + `toolchain go1.25.8` in its `go.mod`. This module is `go 1.22` and the local/CI toolchain is
  `go1.22.12`. Adding the SDK forces bumping the module to 1.24+ and upgrading Go everywhere (local + both CI
  workflows) — a real cost paid to make two JSON `POST`s.
- **Transitive bloat — the opposite of "control."** A `POST /v1/messages` via the SDK drags in (all indirect):
  the **entire AWS SDK v2** (config/credentials/sts/sso/ssooidc/smithy — for Bedrock), **Google Cloud API +
  gRPC + protobuf + genproto + opencensus + s2a** (for Vertex), **OpenTelemetry** (5 modules), the **MCP
  go-sdk**, `invopop/jsonschema`, `oauth2`, `creack/pty`, `go-vcr`, `standard-webhooks`, `segmentio/encoding`,
  `buger/jsonparser`, and **yaml v2 + v3 + v4-rc** — ~50 modules, the vast majority for Bedrock/Vertex/MCP/
  webhook features WEE does not use. `openai/openai-go` v1.12.0 is lighter (~16 modules) but still pulls the
  **Azure identity SDK** (azcore/azidentity/MSAL) + jwt + uuid for Azure OpenAI, which WEE also doesn't use.
- **The dropped `gjson` returns.** `tidwall/gjson` + `sjson` are transitive dependencies of **both** SDKs —
  re-introducing, through the back door, the exact library dropped above (see the gjson entry).
- **Maintenance note.** `anthropic-sdk-go` ships actively (v1.57.0, 4 days before this check); `openai-go`'s
  latest is v1.12.0 from 2025-07-30 — ~1 year stale as of 2026-07-14.
- **What WEE actually needs from a provider:** one `Complete(ctx, messages, params)` returning full output +
  `usage` tokens. Both APIs are a single JSON `POST` with tokens in the response body; streaming is
  unnecessary because each node's output is validated **whole** against its Contract schema before going
  downstream; retry/backoff already lives in `core/engine/retry.go`; tools are executed engine-side, not via
  provider-native function-calling. A hand-rolled client covers this with **zero new dependencies**, no Go
  bump, and full control of headers and error→transient mapping — while the `Provider` interface preserves the
  clean abstraction boundary the SDKs were wanted for. The one scenario that would flip this back to SDKs is a
  future decision to adopt provider-native function-calling instead of engine-side tools.

**Net effect on §1:** two pins move — model provider integration is now hand-rolled HTTP (this entry), and the
earlier `tidwall/gjson` item was resolved by hand-rolling too. No official vendor SDK is added to `go.mod`.

---

## M1.0 — Foundations & Repo Skeleton

**Goal:** a clean monorepo skeleton, CI green, licensing and naming settled.
**Depends on:** nothing (first milestone).
**Delivers:** no spec REQs — infrastructure + the PRIN-04 vocabulary gate.

### Tasks

- [x] Create directories: `core/`, `cli/`, `sdk/`, `ui/`, `docs/`, `docs/adr/`, `examples/`, `schemas/`, `.github/workflows/`.
- [x] `go mod init github.com/tzpereira/workflow-execution-engine` at repo root.
- [x] Add `.golangci.yml` at repo root enabling at least: `govet`, `staticcheck`, `errcheck`, `ineffassign`, `unused`.
- [x] Add `LICENSE` file — Apache-2.0 text, copyright holder = repo owner.
- [x] Add `docs/adr/0000-template.md` — minimal ADR template (Title / Status / Context / Decision / Consequences).
- [x] Add `docs/adr/0002-language-runtime.md` — record: Go for Core/CLI/SDK, single static binary, goroutine-native
      scheduler, TypeScript confined to UI. Summarize rationale from VISION.md "Stack" section — don't
      duplicate it verbatim, reference it.
- [x] Add `docs/adr/0003-serialization-format.md` — record: YAML is canonical authoring format, JSON is the
      equivalent wire/storage format, round-trip must be loss-free.
- [x] Add `docs/adr/0004-content-addressing.md` — record: SHA-256 over canonical JSON for artifact and cache
      keys.
- [x] Add `docs/adr/0005-contract-validation.md` — record: JSON Schema draft 2020-12 via
      `santhosh-tekuri/jsonschema/v6` (resolved 2026-07-14, see §1a), replacing any runtime-specific validator.
- [x] Add `docs/glossary.md` listing and defining (1-2 sentences each): `Workflow`, `Worker`, `Contract`,
      `ContextPolicy`, `Artifact`, `Event`, `Execution`, `Budget`, `Tool`, `Cache`. Include the forbidden-vocabulary
      table from VISION.md "Naming Philosophy" (Prompt→Contract, Conversation→Execution, Chat→Workspace,
      Agent→Worker, Memory→Workspace/Artifacts/Context).
- [x] Bootstrap the UI project: `cd ui && pnpm create vite@latest . -- --template react-ts`.
- [x] In `ui/`, add ESLint + Prettier + Vitest: `pnpm add -D eslint prettier vitest @testing-library/react @testing-library/jest-dom`.
- [x] Add `.github/workflows/go.yml`: on push/PR, run `go build ./...`, `go vet ./...`, `golangci-lint run`,
      `go test ./... -race`.
- [x] Add `.github/workflows/ui.yml`: on push/PR, run (with working-directory `ui/`) `pnpm install`,
      `pnpm lint`, `pnpm typecheck` (`tsc --noEmit`), `pnpm test`. Must be a fully independent job from
      `go.yml` — neither blocks the other.
- [x] Add a top-level `.gitignore` covering: `.workflow/`, `node_modules/`, `ui/dist/`, Go build artifacts,
      `.DS_Store`.

### Acceptance criteria

- [x] `go build ./...` succeeds on a clean clone.
- [x] `go test ./... -race` succeeds (even with zero tests, must not error).
- [x] `cd ui && pnpm install && pnpm test` succeeds.
- [ ] Both GitHub Actions workflows are green on the PR/commit that introduces them.
- [x] `docs/glossary.md` exists and none of `Prompt`, `Agent` (outside the glossary's own "instead of" table),
      `Chat`, `Memory` appear anywhere else in `docs/`, `core/`, `cli/`, `sdk/` (`grep -rniE '\bprompt\b|\bagent\b|\bchat\b|\bmemory\b' core/ cli/ sdk/ docs/ --include='*.go' --include='*.md'` returns nothing unexpected).

---

## M1.1 — Domain Model & Serialization

**Goal:** every domain object exists as both a JSON Schema and a mirrored Go struct, with loss-free
round-trip serialization and canonical hashing.
**Depends on:** M1.0.
**Delivers:** REQ-DEF-01..05 · REQ-WORKER-01 (struct+schema) · REQ-ARTIFACT-03 (types) · REQ-EVENT-01 (catalog).

### Tasks

- [x] Write `schemas/workflow.schema.json` — fields: `id`, `version`, `nodes[]`, `edges[]`, `defaults`, `budget`.
- [x] Write `schemas/worker.schema.json` — fields: `id`, `version`, `objective`, `constraints[]`, `tools[]`,
      `contextPolicy`, `contract`, model config (`provider`, `model`, `params`).
- [x] Write `schemas/contract.schema.json` — fields: `goal`, `rules[]`, `outputSchema` (a nested JSON Schema),
      `successCriteria[]`, `maxRetries`.
- [x] Write `schemas/context-policy.schema.json` — enum `full | parent-only | artifacts | diff-only | summary | none`,
      plus a `params` object for the `artifacts` variant (list of artifact refs).
- [x] Write `schemas/artifact.schema.json` — fields: `id`, `type` (enum: `code|markdown|json|diff|image|file|report|test-result|metrics`),
      `contentHash`, `mimeType`, `metadata`, `producedBy`.
- [x] Write `schemas/event.schema.json` — fields: `type`, `timestamp`, `executionId`, `nodeId` (optional), `payload`.
- [x] Write `schemas/execution.schema.json` — fields: `id`, `workflowRef` (name@version), `state`, graph
      snapshot, budget status, timestamps.
- [x] Write `schemas/budget.schema.json` — fields: `maxCostUsd`, `maxTokens`, `maxDurationMs`, `maxRetriesPerNode`.
- [x] Write Go structs in `core/domain/`: `workflow.go`, `worker.go`, `contract.go`, `context_policy.go`,
      `artifact.go`, `event.go`, `execution.go`, `budget.go` — one file per schema, field names/tags matching
      the schema's JSON property names exactly.
- [x] Write `core/domain/schema_drift_test.go`: for each struct, marshal a populated instance to JSON and
      validate it against the corresponding `schemas/*.schema.json` file; fails the build if a Go field has no
      schema counterpart or vice versa.
- [x] Write `core/serialize/yaml.go` and `core/serialize/json.go`: `Load(path) (*domain.Workflow, error)` and
      `Save(*domain.Workflow, path) error` for both formats, sharing the same in-memory struct.
- [x] Write `core/canonical/marshal.go`: a canonical JSON marshaler with deterministic (sorted) key order —
      Go's built-in map ordering is not stable enough for hashing. This is the single function every hash in
      the project (artifact IDs, cache keys) must route through.
- [x] Write `core/validate/schema.go`: wraps `santhosh-tekuri/jsonschema/v6`, validates a domain object
      against its schema, returns human-readable, positional errors (file:line where the source was YAML).
- [x] Write `core/validate/graph.go`: validates a `Workflow`'s node/edge graph — no cycles, no orphan nodes,
      every edge resolves to an existing node, every artifact referenced by a `ContextPolicy` is producible by
      some upstream node.
- [x] Write round-trip property tests in `core/serialize/roundtrip_test.go`: parse → serialize → parse must
      yield an identical struct, for at least one fixture per domain object (put fixtures in
      `core/serialize/testdata/`).

### Acceptance criteria

- [x] `go test ./core/... -race` passes, including the schema-drift and round-trip tests.
- [x] Feeding a workflow YAML with an unresolved edge reference to `validate/graph.go` produces an error
      message containing the offending node/edge id and, where derivable, the source line.
- [x] Feeding a workflow YAML with a cycle is rejected with a message naming the cycle.

---

## M1.2 — Artifact Store & Event Log

**Goal:** local content-addressed artifact storage and an append-only event log, sufficient to reconstruct
an execution's full timeline from disk alone.
**Depends on:** M1.1.
**Delivers:** REQ-ARTIFACT-01..04 · REQ-EVENT-02, REQ-EVENT-04 (snapshot).

### Tasks

- [x] Write `core/store/artifact_store.go`: `Put(content []byte) (hash string, error)` writes to
      `.workflow/artifacts/<sha256>` (via `core/canonical` + SHA-256), `Get(hash string) ([]byte, error)` reads
      it back, dedupes automatically (same content → same path, second write is a no-op).
- [x] Define artifact type constants in `core/domain/artifact.go` (already scaffolded in M1.1): `Code`,
      `Markdown`, `JSON`, `Diff`, `File`, `Report`, `TestResult`, `Metrics`.
- [x] Write `core/eventlog/writer.go`: `Append(executionID string, ev domain.Event) error`, appends one JSON
      line to `.workflow/executions/<id>/events.jsonl`.
- [x] Write `core/eventlog/reader.go`: `ReadAll(executionID string) ([]domain.Event, error)`, streams the
      JSONL file back into a slice, in order.
- [x] Define the v1 event catalog as typed constants in `core/domain/event.go`: `ExecutionStarted`,
      `ExecutionFinished`, `WorkerStarted`, `WorkerFinished`, `ToolCalled`, `ToolResult`, `ArtifactCreated`,
      `ContractValidated`, `ContractViolation`, `Retry`, `Failure`, `CacheHit`, `CacheMiss`, `BudgetWarning`,
      `BudgetExceeded`, `Cancelled`.
- [x] Write `core/eventlog/snapshot.go`: on `ExecutionStarted`, persist the fully-resolved graph + config as a
      frozen JSON blob under `.workflow/executions/<id>/snapshot.json` — this is what audit replay (M1.7) reads
      instead of re-resolving anything live.

### Acceptance criteria

- [x] Writing the same artifact content twice results in exactly one file under `.workflow/artifacts/`
      (assert via a test that checks directory entry count).
- [x] A test that: starts a fake execution, appends a handful of events, writes a snapshot, then — using
      *only* the contents of `.workflow/executions/<id>/` and nothing else in memory — reconstructs an ordered
      timeline. No hidden in-process state required.

---

## M1.3 — Workflow Runtime (Engine)

**Goal:** a working scheduler: parallel execution of independent nodes, retries, cancellation, resume, budget
enforcement.
**Depends on:** M1.2.
**Delivers:** REQ-RUNTIME-01..06 · REQ-WORKER-02 (executor seam) · REQ-BUDGET-01 (halt mechanics), REQ-BUDGET-02.

### Tasks

- [x] Write `core/engine/scheduler.go`: topological sort of the workflow graph; a bounded goroutine pool
      (size = `--concurrency`, default e.g. 4) dispatches nodes whose dependencies are all satisfied.
- [x] Write `core/engine/node.go`: node execution wrapper — takes a node, resolves its input artifacts, calls
      into the (not-yet-built) Worker/Contract layer as a pluggable `NodeExecutor` interface so M1.4 can slot
      in without touching the scheduler.
- [x] Write `core/engine/conditional.go`: conditional edge evaluation — predicate is a structured
      `{path, op, value}` on the domain `Edge`, evaluated against the upstream artifact's JSON with a
      hand-rolled dotted-path walker over `encoding/json` (gjson dropped 2026-07-14, see §1a); edge is only
      traversed if the predicate holds.
- [x] Write `core/engine/retry.go`: retry with exponential backoff; three distinct classifications —
      transient error (retry as-is), contract violation (retry with validation feedback appended — hook point
      for M1.4), fatal error (fail node immediately, no retry).
- [x] Write `core/engine/failure_policy.go`: per-node failure policy — `fail-execution` (default),
      `continue` (mark node failed, continue independent branches), `fallback-node` (redirect to a designated
      fallback node id).
- [x] Wire `context.Context` cancellation through every goroutine the scheduler spawns; on cancellation, emit
      `Cancelled`, persist whatever partial state exists, and return cleanly (no goroutine leaks — verify with
      `-race` and a leak-detector test).
- [x] Write `core/engine/resume.go`: `Resume(executionID string) error` — reads the snapshot + event log,
      determines which nodes already have `WorkerFinished` (or a cache hit) recorded, and restarts the
      scheduler skipping those, reusing their persisted artifacts as inputs downstream.
- [x] Write `core/engine/budget.go`: budget checks before each node dispatch and (hook point) before each
      model call — emits `BudgetWarning` at 80% of any limit, halts and emits `BudgetExceeded` at 100%.

### Acceptance criteria

- [x] Test: diamond graph `A → B, C → D` — `B` and `C` execute concurrently (assert via timing or instrumented
      start/end overlap), `D` receives both artifacts.
- [x] Test: kill the process mid-execution (or simulate via context cancellation) on a multi-node workflow,
      then call `Resume` — the finished nodes are not re-executed (assert no duplicate `WorkerStarted` events
      for them), and the execution completes.
- [x] Test: a budget of e.g. `$0.01` on a workflow whose nodes report cost via a stub `NodeExecutor` halts
      deterministically, emits `BudgetExceeded`, and the process/test returns a distinct non-zero result for
      that case.

---

## M1.4 — Workers, Contracts & Model Layer

**Goal:** Workers call a real model provider; every output is validated against its Contract's schema before
it's allowed downstream; Context Policies are enforced and auditable.
**Depends on:** M1.3.
**Delivers:** REQ-MODEL-01..05 · REQ-CONTRACT-01..04 · REQ-CTXPOL-01..03 · REQ-WORKER-01..03 · REQ-BUDGET-01 (real cost), REQ-BUDGET-03 · REQ-EVENT-03 (hash-chain retrofit) · NFR-SEC-01 (provider hygiene), NFR-SEC-02.

### Tasks

- [x] **Event-log hash-chain retrofit** (REQ-EVENT-03, ADR 0007): add a `prevHash` field to `domain.Event`
      (+ `event.schema.json`); `eventlog.Append` computes each event's canonical hash and chains it to its
      predecessor (genesis chains from the snapshot's hash); add a `Verify(executionID)` routine that walks
      the chain and reports the first break. Done first — before real executions exist to migrate.
- [x] Write `core/model/provider.go` (REQ-MODEL-01): a `Provider` interface — `Complete(ctx, messages, params)
      (Response, error)` — abstracting the model call. Keep it strictly provider-agnostic; no vendor- or
      transport-specific types (no request/response JSON structs, no HTTP concerns) leak across this interface.
      Add a small registry so a workflow's `provider` field selects the implementation; **OpenAI is the
      default** (cheaper).
- [x] Write `core/model/openai/client.go` (REQ-MODEL-02, REQ-MODEL-04, REQ-MODEL-05): implements `Provider`
      with a **hand-rolled `net/http` client** against `POST /v1/chat/completions`, reading `OPENAI_API_KEY`.
      **Base URL is configurable** — any OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp server) works
      as a provider; the API key becomes optional for keyless endpoints. Map `429`/`5xx`/timeouts →
      `retry.Transient` (honor `Retry-After`) so `core/engine/retry.go` owns backoff. Read
      `usage.prompt_tokens`/`completion_tokens` from the response body for cost accounting. No third-party
      SDK. Never log request headers (NFR-SEC-01).
- [x] Write `core/model/anthropic/client.go` (REQ-MODEL-03, REQ-MODEL-05): implements `Provider` with a
      **hand-rolled `net/http` client** against `POST /v1/messages` (headers `x-api-key` +
      `anthropic-version`), reading `ANTHROPIC_API_KEY`. Same transient-error mapping; read
      `usage.input_tokens`/`output_tokens`. No third-party SDK. Never log request headers (NFR-SEC-01).
- [x] Vendor-type isolation test (REQ-MODEL-01): a package-boundary check (e.g. a small `go/packages` or
      grep-based test, or an architecture assertion) proving no `core/model/anthropic` or `core/model/openai`
      type is referenced outside its own package — the rest of the engine sees only `Provider`/`Response`.
- [x] Write `core/contract/compiler.go` (REQ-CONTRACT-01 plumbing, REQ-CTXPOL-01): `Compile(worker
      domain.Worker, resolvedContext, feedback) (messages []model.Message)` — the **only** place in the
      codebase model-input text is constructed. Never exposed as a public/user-facing concept — it's
      plumbing, not a feature. (Signature took the policy-resolved `[]policy.Item` plus the retry-feedback
      delta, keeping the compiler engine-free and avoiding an import cycle.)
- [x] Write `core/contract/enforce.go` (REQ-CONTRACT-01..03): the output pipeline —
      1. parse model output as JSON,
      2. validate against `contract.outputSchema` via `core/validate`,
      3. on violation, retry via `core/engine/retry.go`'s contract-violation path with the validation errors
         appended as feedback — **only the errors, never a re-inflated copy of the full context** (delta
         feedback, PRIN-05),
      4. after `contract.maxRetries`, emit `ContractViolation` and fail the node.
- [x] Write `core/cost/accounting.go` (REQ-BUDGET-03): per-call token/cost tracking (input/output tokens ×
      provider's published rates), aggregated per node and rolled up per execution; wire this into
      `core/engine/budget.go`'s checks (REQ-BUDGET-01 with real cost).
- [x] Write `core/policy/resolver.go` (REQ-CTXPOL-01..03): given a `ContextPolicy` and the current execution
      state, produce exactly the context slice (subset of upstream artifacts/history) the Worker is allowed
      to see; **when no policy is declared, default to the smallest slice — parent output only — never full
      history** (REQ-CTXPOL-02). Log the resolved slice (artifact hashes actually included) so it's auditable
      later via the Inspector (M1.13).
- [x] Ship tight example contracts (REQ-CONTRACT-04): the M1.4 examples use bounded arrays (`maxItems`),
      bounded strings (`maxLength`), and enums — the anti-slop shape templates will inherit. (Shipped
      `examples/pr-review/`; `examples/examples_test.go` schema-validates them and asserts the tight-contract
      markers are present.)

### Acceptance criteria

- [x] Test (REQ-WORKER-03, REQ-CONTRACT-01): a Worker with `outputSchema = {score: number, issues: string[]}`
      — no malformed output ever reaches downstream nodes (asserted at the `NodeExecutor` boundary and across
      a producer→consumer graph; `TestNoMalformedOutputCrossesBoundary`, `TestMalformedNeverReachesDownstream`).
- [x] Test (REQ-CONTRACT-02): a stubbed `Provider` that returns malformed JSON once then valid JSON —
      triggers exactly one retry-with-feedback, visible as a `Retry` event containing the validation error
      text; the retry call carries the delta and only the delta (`TestContractRetryWithDeltaFeedback`).
      Terminal violation covered by `TestContractViolationTerminal` (REQ-CONTRACT-03).
- [x] Test (REQ-CTXPOL-01): a Worker configured with `diff-only` context policy — asserted on the *compiled*
      context (from `core/contract/compiler.go`) that it contains only the diff artifact and nothing from a
      sibling Planning node's output (`contract.TestCompiledContextIsDiffOnly`; resolver unit tests in
      `core/policy`).
- [x] Test (REQ-EVENT-03): corrupt one line of a finished execution's `events.jsonl` → `Verify` fails and
      names the break point; an untouched log verifies clean (`eventlog.TestVerifyDetectsTamper`,
      `TestVerifyCleanChain`, `TestVerifyDetectsGenesisBreak`). Chain hashes the *raw* line bytes, so
      unknown-field injection is caught too.
- [x] Test (REQ-MODEL-04): the OpenAI client with an overridden base URL talks to a local stub server —
      proving any OpenAI-compatible endpoint (Ollama/vLLM) works with zero engine changes
      (`openai.TestBaseURLOverrideTalksToStub`, keyless).
- [x] Test (NFR-SEC-01): an execution driven by a real provider client with a secret key leaks no key
      material into any file it writes — events, snapshot, or artifacts (`openai.TestNoKeyMaterialInExecutionRecord`);
      provider errors never carry headers (`openai.TestNoHeaderInError`).

---

## M1.5 — Tool Interface & Built-in Tools

**Goal:** Workers can invoke sandboxed tools; every tool call is schema-validated and auditable.
**Depends on:** M1.4.
**Delivers:** REQ-TOOL-01..04 · NFR-SEC-03 (threat model v1).

### Tasks

- [x] Write `core/tool/tool.go`: `Tool` interface — `Name() string`, `Version() string`,
      `InputSchema() []byte`, `OutputSchema() []byte`, `Execute(ctx, input json.RawMessage) (json.RawMessage, error)`.
- [x] Write `core/tool/filesystem/filesystem.go`: read/write/list, path confined to the workspace root
      (resolve and reject any path that escapes it via `..` or symlink traversal — write an explicit test for
      this).
- [x] Write `core/tool/terminal/terminal.go`: executes a command from a per-workflow allowlist, enforces a
      timeout, captures stdout/stderr, wraps the result as a `TestResult` or `File` artifact depending on
      config.
- [x] Write `core/tool/git/git.go`: `status`, `diff`, `add`, `commit`, `branch`. Explicitly **no `push`** in
      Phase 1 (matches ROADMAP.md).
- [x] Write `core/tool/http/http.go`: `GET`/`POST`, domain allowlist enforced per workflow (reject any request
      to a host not on the list).
- [x] Document sandboxing rules in `docs/concepts/tools.md`: workspace-root confinement for filesystem/git,
      command allowlists for terminal, domain allowlists for HTTP.
- [x] Wire every tool call to emit `ToolCalled` (with input) and `ToolResult` (with output or error) events
      — done via `tool.Invoke`, which takes the scheduler's emitter and records the pair (with the error on
      `ToolResult` whichever step fails). Threat model shipped in `docs/threat-model.md` (NFR-SEC-03).

### Acceptance criteria

- [x] Test: terminal tool running a test command (`echo` standing in for `npm test`) produces a
      test-result-shaped output with a pass/fail flag and captured stdout, and a non-zero exit is captured as
      `passed:false` rather than errored (`terminal.TestTestResultArtifact`, `TestNonZeroExitIsCapturedNotErrored`).
- [x] Test: filesystem tool path-traversal attempts (`../../etc/passwd`, absolute paths outside root, symlink
      escape) are all rejected with a clear error, none succeed (`filesystem.TestPathTraversalRejected`,
      `TestSymlinkEscapeRejected`).
- [x] Test: HTTP tool rejects a request to a domain not in the workflow's allowlist, and never contacts it
      (`http.TestDisallowedDomainRejected`; empty allowlist denies all in `TestEmptyAllowlistDeniesAll`).

---

## M1.6 — Node Cache (local)

**Goal:** re-running an unchanged workflow costs $0 and completes in under 2 seconds; changing one node only
re-executes it and its downstream.
**Depends on:** M1.5.
**Delivers:** REQ-CACHE-01..03, REQ-CACHE-04 (core modes).

### Tasks

- [x] Write `core/cache/key.go`: `Key(workerID, workerVersion, contractHash string, inputArtifactHashes []string, modelParams, toolVersions []string, contextPolicy domain.ContextPolicy) string` —
      SHA-256 over the canonical JSON (via `core/canonical`) of all those fields concatenated.
- [x] Write `core/cache/store.go`: an index (simple file-based key→value, e.g. a JSON or bolt-style file
      under `.workflow/cache/index`) mapping a cache key to the set of artifact hashes and events recorded the
      first time that key was produced. Reuses `core/store` for the actual artifact bytes — no duplicate
      storage.
- [x] Add cache modes to the engine: `on` (default), `off` (bypass entirely), `readonly` (read hits, never
      write new entries) — implement as a parameter threaded through `core/engine`.
- [x] Wire a cache check into `core/engine/node.go` before dispatching to the model: on hit, replay the
      recorded artifacts and events into the new execution at cost `$0`, emit `CacheHit`; on miss, proceed
      normally and emit `CacheMiss`, then write the new entry.
- [x] Implement the underlying library functions for `cache ls` / `cache inspect <key>` / `cache clear` in
      `core/cache/inspect.go` (list all keys with metadata, dump one entry's recorded artifacts/events, delete
      all cache entries). CLI wiring for these happens in M1.9 — see the note in §1.
- [x] Ensure invalidation is total, not partial: any change to any input in the key composition produces a
      completely new key. No fuzzy/partial matching in Phase 1.

### Acceptance criteria

- [x] Test: a multi-node fixture run twice unchanged — the second run is 100% cache hits, cost `$0.00`, and
      makes zero model calls (`engine.TestSecondRunIsAllCacheHitsAtZeroCost`). (Sub-2s holds trivially with
      the fake provider; wall-clock isn't asserted — it would be a flaky gate — the zero-calls/\$0 is the
      substance.)
- [x] Test: bump one node's contract and re-run — only that node and its downstream cone re-execute;
      upstream and siblings stay cache hits (`engine.TestChangingOneNodeReExecutesOnlyItsCone`).

**Milestone gate:** once M1.6's acceptance criteria pass, the domain model, event catalog, and artifact model
are frozen. UI work (M1.11 onward) may begin here if you choose to parallelize; the default path in this
document still finishes M1.7–M1.10 first.

---

## M1.6a — Tool-Backed Graph Nodes

**Goal:** a graph node can run a Tool deterministically — no LLM ever decides its input — so the flagship
demo's Test Runner/Commit nodes (and any non-code workflow's tool-only steps) are actually buildable.
**Depends on:** M1.6. **Inserted milestone:** closes a pre-existing gap `docs/spec/workers.md`'s
REQ-WORKER-02 already anticipated ("tool-backed... executors") without any milestone ever delivering it —
not new scope invention. See [ADR 0008](adr/0008-tool-backed-graph-nodes.md) for the two contested design
choices (Node- vs Worker-level declaration; the event-emission bridge) and why each was decided the way it
was. Numbered `M1.6a` rather than renumbering M1.7–M1.15 — that would be a large, error-prone, zero-benefit
edit across every spec file's `Delivered by:` line for work not yet started; nothing in M1.7 depends on
tool-backed nodes existing first.
**Delivers:** REQ-WORKER-04..07 (new) · REQ-WORKER-02 (closes its "tool-backed" clause) · REQ-TOOL-02 (wires
`tool.Invoke` into the graph for the first time) · NFR-SEC-01 (narrow extension: `${env:...}` tool-input
secrets).

### Tasks

- [x] Add `Tool *ToolCall` to `domain.Node` (`ToolCall{ToolName, Input}`), alongside the existing `Worker
      string` — both optional, exactly one required by graph validation. `domain.Worker`/
      `worker.schema.json` are untouched (the M1.6 freeze holds for Worker; this is a disclosed, narrow
      exception scoped to `Node` only).
- [x] Update `schemas/workflow.schema.json`'s node item: drop `worker` from `required`, add the `tool`
      property. Confirmed schema-drift-safe: `TestSchemaDrift` only diffs top-level workflow keys, not the
      node-item shape nested inside `nodes[]`.
- [x] Add a `core/validate/graph.go` check: exactly one of `Worker`/`Tool` per node, with a clear positional
      error for "neither" and "both" — a Go-level semantic rule (matching how `graph.go` already owns
      cycles/ancestry), not forced into a JSON Schema `oneOf`.
- [x] Write `core/engine/tool_input.go`: resolve a `ToolCall.Input`'s whole-string placeholders —
      `${nodeID.path}` via the upstream artifact (reusing the existing private `lookupPath` from
      `conditional.go`, zero new parsing library) and `${env:NAME}` via the OS environment at call time.
      Collect which upstream hashes were actually referenced, for `NodeResult.ContextHashes` (the same
      audit property REQ-CTXPOL-03 gives model-backed nodes, extended to tool-backed ones for free).
- [x] Write `core/engine/tool_executor.go`: `ToolExecutor` implements `NodeExecutor` (and the new
      `ToolEmitter` capability, not `CacheKeyer`), resolving input, calling `tool.Invoke`, and mapping the
      result — `Type` from the tool's optional `ArtifactType()` capability (already built in M1.5's
      `terminal.Tool`) or `ArtifactJSON` by default; `Validated` left `false` (tool output validation is
      REQ-TOOL-01's own concern, not REQ-CONTRACT-01's).
- [x] **Redact `${env:...}`-resolved secret values** from every event payload `ToolExecutor` emits, from any
      error string it returns directly, and from the resulting artifact content itself before `core/store`
      persists it — narrowly scoped to this new code path (the general M2.0 redaction pass stays separate,
      deferred scope). This is a blocking requirement, not a nice-to-have: without it, `tool.Invoke`'s
      existing `ToolCalled`/`ToolResult` payloads would write a resolved secret straight into the persisted
      event log — and, found only while writing the NFR-SEC-01 e2e test (not anticipated up front), a
      tool's own output can legitimately echo back what it was given (e.g. terminal's `curl -v` printing
      request headers to stderr), so the artifact needed the same treatment.
- [x] Add `ToolEmitter` to `core/engine/node.go` (`ExecuteWithEmit(ctx, req, emit) (NodeResult, error)`),
      mirroring the existing `CacheKeyer` optional-capability pattern exactly — a per-call closure
      parameter (race-safe: no shared mutable state), never a mutated field on the executor `Scheduler`
      calls concurrently from its goroutine pool. Branch on it in `executeNode`.
- [x] Write `core/engine/dispatch_executor.go`: `DispatchExecutor` composes `WorkerExecutor` + `ToolExecutor`
      behind `Scheduler`'s one `exec NodeExecutor` field, routing each node on `Node.Tool != nil`; its
      `CacheKey` returns `ok=false` unconditionally for tool-backed nodes (REQ-WORKER-07).
- [x] Extend `examples/pr-review/` (or add `examples/pr-review-autofix.yaml`) with real Test Runner
      (terminal) and Commit (git) tool nodes.
- [x] Add `examples/github-pr-review/` demonstrating remote GitHub access — fetch a PR diff and post a
      review, both via the existing generic `http` tool + `${env:GITHUB_TOKEN}` — zero new tool code. `git
      push` remains explicitly out of scope (matches the existing, unreopened "no push in Phase 1"
      decision); a workflow's terminal state is "committed locally, tests green."

### Acceptance criteria

- [x] Test: a node declaring both `worker` and `tool`, and a node declaring neither, are both rejected by
      graph validation with a clear, positional error.
- [x] Test: a mixed graph (an LLM-backed node feeding a tool-backed node) runs end-to-end through the real
      `Scheduler`, emitting `ToolCalled`/`ToolResult` for the tool node and skipping the cache for it.
- [x] Test: an execution driven by a tool node referencing `${env:SOME_SECRET}` never contains that secret's
      value in any file the run writes — events, snapshot, or artifacts — including on the error path
      (mirrors `openai.TestNoKeyMaterialInExecutionRecord`).

---

## M1.7 — Replay

**Goal:** any past execution can be replayed for free (audit) or re-executed with cache applied, with an
honest divergence report.
**Depends on:** M1.6.
**Delivers:** REQ-REPLAY-01..03 (core).

### Tasks

- [ ] Write `core/replay/audit.go`: `Audit(executionID string) (Timeline, error)` — reconstructs the full
      timeline (events + artifacts) from `.workflow/executions/<id>/` alone, zero model calls, zero cost.
- [ ] Write `core/replay/reexecute.go`: `Reexecute(executionID string) (newExecutionID string, error)` —
      loads the frozen snapshot (workflow/version/graph/contracts as recorded), re-runs it through
      `core/engine`; cache (M1.6) naturally applies since the node keys are unchanged for untouched nodes.
- [ ] Write `core/replay/divergence.go`: given an original execution and a re-execution, classify each node as
      `cached` (byte-identical) or `re-executed` (new output), and produce a side-by-side artifact diff for
      every re-executed node.
- [ ] Write `docs/replay-honesty.md`: what replay guarantees (deterministic process, recorded results,
      cache-identical re-runs of unchanged nodes) and what it explicitly does not guarantee (byte-identical
      *new* model output when a node actually re-executes — LLMs are not deterministic, and this document says
      so plainly).

### Acceptance criteria

- [ ] Test: `Audit` on a previously-completed execution works with network/model access disabled (prove zero
      external calls).
- [ ] Test: `Reexecute` + `divergence.go` on an execution where one contract changed correctly labels the
      changed node (and its downstream) as `re-executed` and everything else as `cached`.

---

## M1.8 — Versioning

**Goal:** every definition is versioned and content-hash-pinned; executions remain replayable even after
definitions evolve; tampering is rejected.
**Depends on:** M1.7.
**Delivers:** REQ-VERSION-01..03 (core).

### Tasks

- [ ] Add semantic version fields (already present in schemas from M1.1) enforcement: `core/registry/version.go`
      validates that `Workflow`/`Worker`/`Contract`/`Tool` definitions carry a valid semver.
- [ ] Ensure every `Execution` snapshot stores exact content hashes of the definitions it used (not just
      version strings) — verify this was already done in M1.2/M1.7; add it if not.
- [ ] Write `core/registry/immutability.go`: if a definition's content hash changes but its version string
      does not, reject with a validation error naming the definition and the mismatched hash. This is what
      prevents silent mutation of "released" definitions.
- [ ] Write `core/registry/export.go`: `Export(name, version string) ([]byte, error)` — bundles a workflow +
      its workers + contracts into one portable archive (e.g. a tar or zip of canonical JSON files), with
      secrets explicitly excluded (assert nothing matching an env-var-reference pattern leaks in).

### Acceptance criteria

- [ ] Test: an old execution (definitions since bumped to a new version) still replays correctly — audit
      replay reads the pinned hashes, not the current registry state.
- [ ] Test: hand-edit a definition's content without bumping its version — `immutability.go` rejects it with
      a clear, specific error.

---

## M1.9 — CLI

**Goal:** the full engine is usable from a single static binary, feeling like `git`/`terraform`.
**Depends on:** M1.8.
**Delivers:** REQ-CLI-01..04 · NFR-CLI-01 · CLI surfaces of REQ-CACHE-04, REQ-VERSION-03, REQ-REPLAY-03.

### Tasks

- [ ] Scaffold `cli/` with cobra: `cli/main.go` (entrypoint, builds to `wee`), one file per command under
      `cli/cmd/`.
- [ ] Implement `wee run <workflow.yaml>` — flags: `--input`, `--budget`, `--cache=on|off|readonly`,
      `--resume <executionId>`, `--concurrency`, `--json` (machine-readable event stream to stdout, same
      schema `wee serve` will use in M1.12).
- [ ] Implement `wee replay <executionId>` (audit) and `wee replay <executionId> --execute` (re-execution),
      wrapping `core/replay`.
- [ ] Implement `wee inspect <executionId>`: tree view of the graph, per-node cost/tokens/duration, artifact
      listing; `--node <id>` drills into one node's detail.
- [ ] Implement `wee validate <workflow.yaml>`, wrapping `core/validate`.
- [ ] Implement `wee export <name>@<version>`, wrapping `core/registry/export.go`.
- [ ] Implement `wee cache ls|inspect <key>|clear`, wrapping `core/cache/inspect.go` (built in M1.6).
- [ ] Implement `wee init`: scaffolds a minimal example workflow + directory structure in the current folder.
- [ ] Implement `wee list`: lists known workflows/executions in the current workspace.
- [ ] Live terminal rendering for `wee run` (no `--json`): per-node status line, spinner→checkmark on
      completion, running cost ticker, a distinct cache-hit badge — build with `lipgloss`, keep it simple (no
      full-screen TUI).
- [ ] Set exit codes precisely: `0` success, `1` node failure, `2` budget exceeded, `3` validation error,
      `130` cancelled (SIGINT).
- [ ] Add `.goreleaser.yaml`: cross-compile `darwin/amd64`, `darwin/arm64`, `linux/amd64`, `linux/arm64`,
      `windows/amd64`; publish to GitHub Releases.
- [ ] Add `--help` text to every command and subcommand (cobra gives you this for free if `Short`/`Long` are
      filled in — fill them in for all of the above).

### Acceptance criteria

- [ ] Binary starts and prints `--help` output in under 50ms (measure it).
- [ ] `wee init && wee run examples/hello.yaml` works with only the default provider's key set in the
      environment (`OPENAI_API_KEY`, since OpenAI is the default; `ANTHROPIC_API_KEY` if the workflow selects
      Anthropic) — zero other config required.
- [ ] `wee run --json` output is valid, line-delimited JSON matching the event schema from `core/domain/event.go`
      — this is the contract M1.12's `wee serve` must also honor.
- [ ] Each documented exit code is verified by an explicit test (force a budget-exceeded run, force a
      validation error, force a node failure, send SIGINT mid-run).

---

## M1.10 — SDK (Go)

**Goal:** workflows can be authored in Go code, compiling to the exact same canonical format as YAML.
**Depends on:** M1.9.
**Delivers:** REQ-SDK-01..03.

### Tasks

- [ ] Scaffold `sdk/` (same module, imports `core/` directly — no subprocess, no serialization boundary
      between SDK and engine at authoring time).
- [ ] Implement `sdk.New(...) *WorkflowBuilder`, `.Worker(...)`, `.Parallel(...)`, `.Merge(...)` — a fluent
      builder that produces a `domain.Workflow` value identical in content-hash to the equivalent hand-written
      YAML.
- [ ] Implement `(*Workflow).Run(ctx context.Context, opts RunOptions) (*Execution, error)` as the
      programmatic execution entrypoint.
- [ ] Implement event subscription: `exec.Events() <-chan domain.Event`.
- [ ] Implement typed artifact access via generics: `sdk.Artifact[T any](exec *Execution, nodeID string) (T, error)`.
- [ ] Publish `sdk/` as importable at its module path; tag the module (or a `sdk/vX.Y.Z` if using a Go
      workspace/multi-module setup — default here is single module, so this just means the root module's tag
      covers it).

### Acceptance criteria

- [ ] The flagship demo (see M1.15) expressed via the SDK is ≤100 lines.
- [ ] Test: the same workflow defined once in YAML and once via the SDK produce byte-identical content hashes
      (round through `core/canonical`).

---

## M1.11 — Interface: Shell & Canvas (React Flow)

**Goal:** a single-workspace visual builder that round-trips the Core's YAML/JSON with zero drift.
**Depends on:** M1.6 (schemas/events/artifacts frozen) at minimum; this document's default path also has
M1.7–M1.10 done first.
**Delivers:** REQ-UI-01 · `serve` command of REQ-CLI-01.

### Tasks

- [ ] Install `@xyflow/react`, `@rjsf/core`, `@rjsf/validator-ajv8`, `cmdk`, `zustand`, Tailwind CSS in `ui/`.
- [ ] Build the single-workspace layout: Canvas (center, React Flow), Inspector (right panel), Timeline
      (bottom panel), Artifacts/Logs (tabs within the Timeline area). No router, no page navigation — a single
      screen.
- [ ] Build the visual builder: drag-and-drop nodes, draw edges; node configuration forms are generated by
      `@rjsf` directly from `schemas/worker.schema.json` / `contract.schema.json` / `budget.schema.json` — the
      exact same files the Go engine validates against (import them as static JSON, do not hand-copy fields).
- [ ] Build import/export: read a Core YAML/JSON workflow file into the canvas state, and serialize the
      canvas state back to Core YAML/JSON — round-trip must not reorder or reformat user YAML beyond what
      `core/canonical` already normalizes.
- [ ] Build the command palette (`cmdk`, bound to ⌘K): run, validate, zoom, select-node actions.
- [ ] Apply the design system per VISION.md "UI Philosophy": neutral palette, no gradients, no glassmorphism,
      no decorative animation, Linear/GitHub-level density.

### Acceptance criteria

- [ ] A workflow built in the UI, exported, runs unmodified via `wee run` — and vice versa (a `wee`-authored
      YAML imports cleanly into the canvas).
- [ ] Round-trip test: import a hand-written example YAML, export without any edits, diff against the
      original — differences are limited to canonicalization (key order, whitespace), never semantic.

---

## M1.12 — Interface: Live Execution & Timeline

**Goal:** watch an execution happen live, with parallel lanes and cache hits visually distinct.
**Depends on:** M1.11.
**Delivers:** REQ-UI-02.

### Tasks

- [ ] Implement `wee serve` in `core/server/`: HTTP + WebSocket server exposing the same event schema as
      `wee run --json` (from M1.9) — the UI is a pure client of this stream, never a second source of truth.
- [ ] Add `cli/cmd/serve.go` wiring `wee serve` into the CLI.
- [ ] Build the UI's WebSocket client (in `ui/`) consuming that event stream and updating canvas node state:
      `queued` / `running` (animated edge flow) / `succeeded` / `failed` / `cached` (distinct badge) / `skipped`.
- [ ] Build the Timeline: horizontal per-node bars (Gantt-style), parallel lanes visible side by side,
      cache-hit bars visually distinct (e.g. different fill/border), a running cost ticker updating live.
- [ ] Ensure artifacts appear in the Artifacts tab in real time as `ArtifactCreated` events arrive, not only
      after execution completes.

### Acceptance criteria

- [ ] Watching the flagship demo live shows the three reviewers in parallel lanes, then Fixer, then the test
      run — with no visible polling delay/jank (this is a WebSocket push, not a poll loop).

---

## M1.13 — Interface: Inspector & Artifact Viewer

**Goal:** clicking any node answers "what did this Worker see, and what did it produce" in one click.
**Depends on:** M1.12.
**Delivers:** REQ-UI-03, REQ-UI-04 · REQ-CTXPOL-03 (Inspector surface).

### Tasks

- [ ] Build the Inspector panel (opens on node click): Goal, rendered Contract (with its schema), the
      contract validation result, the resolved context (literally what `core/policy/resolver.go` computed and
      logged — the context policy made visible, not just described), inputs, outputs, events, retries,
      cost/tokens/duration.
- [ ] Build artifact viewers, one per type: Diff (side-by-side + unified, via `react-diff-view`), Markdown
      (rendered), JSON (tree view + raw toggle), Code (syntax-highlighted via `shiki`), File (download link),
      TestResult (pass/fail summary + raw log), Report.
- [ ] Build the event log view: filterable by node id and event type, with raw payload expandable per row.
- [ ] Keep all of the above as panels, not modals — no modal-based primary flow anywhere in this milestone.

### Acceptance criteria

- [ ] Every event type from the M1.2 catalog and every artifact type from M1.1 has a non-raw (i.e. not just
      dumped JSON) rendering somewhere in the Inspector or Artifact Viewer.
- [ ] "What did this Worker see?" is answerable in exactly one click (node click → Inspector shows resolved
      context) — verify this manually against the running flagship demo.

---

## M1.14 — Interface: Metrics & Templates

**Goal:** a new user can go from opening the UI to inspecting a completed execution in under 5 minutes with
zero docs.
**Depends on:** M1.13.
**Delivers:** REQ-UI-05 · REQ-METRIC-01..03 (local) · REQ-CONTRACT-05 (verifier template).

### Tasks

- [ ] Build the Metrics panel per execution: total cost, per-node cost breakdown, token usage, duration,
      cache hit rate, retry count, contract violation count, failure count.
- [ ] Build a cross-execution history table: sortable columns for cost/duration/status.
- [ ] Build the Template gallery: the flagship demo plus the 3 secondary demos (Bug Investigation, PRD
      Generation, Architecture Review — see M1.15) as one-click imports.
- [ ] Ensure every template is a plain Core bundle produced via `wee export` (dogfood M1.8/M1.9 — no
      UI-only/proprietary template format).

### Acceptance criteria

- [ ] Fresh user flow, timed: open UI → pick a template → set API key → run → watch it live → inspect a node
      — completes in under 5 minutes without consulting any documentation.

---

## M1.15 — Flagship Demo, Docs & Launch

**Goal:** Phase 1's exit criterion — the 3-minute flagship demo runs end-to-end, cached re-runs included, on
a real repository, recorded in one unedited take.
**Depends on:** M1.14.
**Delivers:** NFR-SEC-04 · REQ-REPLAY-03 (honesty page) · Phase 1 exit criterion.

### Tasks

- [ ] Write `examples/pr-review-autofix.yaml` (or the SDK equivalent) implementing the exact graph from
      VISION.md "Flagship Demo": PR Diff → {Reviewer A (diff-only, style/correctness), Reviewer B (diff-only,
      adversarial), Security Reviewer (diff-only, vulnerabilities)} in parallel → Fixer (reads all reviews +
      diff) → Test Runner (terminal tool) → Commit (git tool).
- [ ] Validate the flagship workflow against 3 real public repositories of different sizes (small/medium/large);
      fix anything that breaks per-repo (timeouts, tool allowlists, budget defaults).
- [ ] Write the docs site content under `docs/`: `quickstart.md`, one page per domain object under
      `docs/concepts/` (workflow, worker, contract, context-policy, artifact, event, execution, budget),
      `docs/cli-reference.md`, `docs/sdk-reference.md`, `docs/replay-honesty.md` (already written in M1.7),
      `docs/cache-deep-dive.md`, `docs/writing-contracts.md`.
- [ ] Add the example gallery in `examples/`: each example gets its own `README.md` stating expected cost for
      a typical run.
- [ ] Write the top-level `README.md`: what this is (per VISION.md's Premise/Positioning), quickstart, and an
      embedded unedited 3-minute demo GIF/video.
- [ ] Launch checklist: tag `v0.1.0`, run `goreleaser release` (binaries to GitHub Releases), publish/verify
      the Homebrew tap (separate repo, e.g. `tzpereira/homebrew-tap`, formula pointing at the release
      binaries), confirm `go install github.com/tzpereira/workflow-execution-engine/cli@v0.1.0` works, draft
      (do not necessarily post) Show HN / Reddit / X launch posts.

### Acceptance criteria (Phase 1 exit — the whole point of this document)

- [ ] One unedited recording: clone → install → run the flagship demo on a real repo → watch it live in the
      UI → change one reviewer's contract → re-run showing partial cache reuse → audit-replay the first run.
      Total under 10 minutes; the flagship portion alone under 3 minutes.
- [ ] A senior engineer who has read only the README and one example can correctly explain, in their own
      words, what a Contract is, what a Context Policy is, and what the Node Cache does.

---

## Definition of "Phase 1 done"

All 16 milestones above (M1.0–M1.15) checked off, both acceptance-criteria checklists and the recording
exist, `v0.1.0` is tagged and released. At that point, and not before, open ROADMAP.md's Phase 2 section and
begin scoping a follow-up execution plan for it — this document does not cover Phase 2 by design (see the
top of this file).

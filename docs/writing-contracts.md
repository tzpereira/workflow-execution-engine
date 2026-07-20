# Writing Contracts

Non-normative. The testable rules are [spec/contracts.md](spec/contracts.md) (`REQ-CONTRACT-*`). Read
[concepts/contract.md](concepts/contract.md) first for what a Contract *is*; this page is the practical
guide to designing one that actually holds.

A Contract is enforced, not requested (PRIN-08) — but enforcement only helps if the schema you write leaves
the model nowhere to hide. A loose `outputSchema` (one big `notes: string`) passes validation trivially and
tells you nothing. A tight one is where the real anti-slop work happens.

## Start from the schema, not the prose

Write `outputSchema` before `goal`/`rules`/`successCriteria` — the schema is what's actually enforced; the
prose only shapes how the model tries to satisfy it. Ask "what's the smallest structured answer this role
needs to give?" before asking "how do I phrase the instructions?"

## The four bounding moves (PRIN-08)

**Enums over prose.** Anywhere the answer is really one of a fixed set, say so:

```yaml
verdict:
  enum: [approve, request-changes, comment]
```

not `verdict: {type: string}` with a rule saying "respond with approve, request-changes, or comment" — the
enum makes an off-list answer a schema violation, not a hope.

**Bounded arrays.** `maxItems` turns "list every issue" (unbounded, slop-prone) into "list the most
important N" (bounded, comparable across runs):

```yaml
issues:
  type: array
  maxItems: 5
```

**Bounded strings.** `maxLength` stops a one-line field from becoming an essay:

```yaml
message:
  type: string
  maxLength: 200
```

**`additionalProperties: false`, everywhere.** Without it, a schema-valid response can carry extra fields
nothing downstream reads or validates — a silent side door around the bound you just wrote. Every object in
the schema, top-level and nested, should close it.

`examples/pr-review/reviewer.worker.yaml`'s contract uses all four together — `verdict`/`severity` as
enums, `issues` capped at 5, `message` capped at 200 chars, `additionalProperties: false` at both the
top level and the nested `issue` object:

```yaml
outputSchema:
  type: object
  additionalProperties: false
  required: [verdict, score, issues]
  properties:
    verdict:
      enum: [approve, request-changes, comment]
    score:
      type: integer
      minimum: 0
      maximum: 100
    issues:
      type: array
      maxItems: 5
      items:
        type: object
        additionalProperties: false
        required: [severity, line, message]
        properties:
          severity:
            enum: [critical, major, minor, nit]
          line:
            type: integer
            minimum: 0
          message:
            type: string
            maxLength: 200
```

`examples/examples_test.go`'s `TestExampleContractsAreTight` locks this shape in CI — a future edit that
drops a `maxItems`/`maxLength`/`enum` marker fails the build, not just a review comment.

## Rules and successCriteria are for the model, not the engine

`goal`, `rules`, and `successCriteria` are prose — they never get validated, only compiled into the model
call. Use them for judgment the schema can't express: *"judge only what the diff shows, don't assume
unshown context"*, *"cite a line number for every issue"*. Don't use them to compensate for a loose schema
("keep your list to 5 items or fewer" as a rule, with `issues: {type: array}` and no `maxItems`) — a rule is
a request; `maxItems` is enforced.

## Retries get the error, never a re-inflated transcript

On a schema violation, the engine retries with the validation error appended as feedback — not the model's
prior (invalid) output re-sent, not a growing conversation. Write Contracts assuming the model gets one
clean shot plus `maxRetries` corrections, each stated as "here's specifically what was wrong," never a
back-and-forth. This is also why `maxRetries` should usually be small (`1`–`2`): a schema violation on
attempt 3 is a sign the schema or the objective needs rework, not that the model needs more tries.

## The strongest verification is a second Worker, not a bigger schema (REQ-CONTRACT-05)

Some claims a Contract's schema genuinely cannot verify on its own — "does this patch actually fix the
stated root cause?" isn't a shape question. The producer grading its own work is the failure mode this
guards against: don't add a `confidence: number` field to the producer's own schema and call it verified.
Instead, add a second, independent Worker whose entire job is judging the first one's Artifact, gating the
graph with a conditional edge. `examples/bug-investigation/verify-patch.worker.yaml` is the reference
implementation — a cheap `gpt-4o-mini` judge with a two-field Contract, deliberately smaller than the
`gpt-4o` producer it grades:

```yaml
outputSchema:
  type: object
  additionalProperties: false
  required: [approved, reason]
  properties:
    approved:
      type: boolean
    reason:
      type: string
      maxLength: 300
```

`workflow.yaml`'s edge `verify-patch → apply-patch` carries `condition: {path: approved, op: truthy}` — the
patch is never applied unless the independent judge says so.

## Checklist before you ship a Contract

- Every object has `additionalProperties: false`, at every nesting level.
- Every open-ended field is either an `enum`, or has a `maxLength`/`maxItems`/`minimum`/`maximum`.
- `maxRetries` is small (1–2) unless you have a specific reason it needs more.
- If the Contract makes a claim a schema can't verify (correctness, safety, "actually fixes it"), there's a
  second Worker judging it, not a self-reported confidence field.

## Related

- [concepts/contract.md](concepts/contract.md) — the enforcement pipeline this guide assumes
- [concepts/worker.md](concepts/worker.md) — where a Contract lives
- [examples/](../examples/README.md) — every shipped Contract, all following this shape

# Versioning & the definition registry

Non-normative. The testable rules are [spec/versioning.md](../spec/versioning.md) (`REQ-VERSION-*`) and
[spec/definition.md](../spec/definition.md) (`REQ-DEF-*`). Implementation: `core/registry/`.

Everything the engine runs is a **versioned definition** at an `id@version` coordinate. A version, once
registered, is immutable — so naming a version is naming exact content, forever. That single property is
what makes cache keys, replay, and audit trustworthy: they pin versions, and the registry guarantees a
pinned version can never mean something different later.

## Immutability is what turns a version into a content pin

The registry stores each Workflow and Worker keyed by `id@version`, alongside the canonical content hash
(ADR 0004) computed when it was registered. Re-registering **identical** content at the same version is a
no-op; re-registering **different** content is a `*registry.ConflictError` that names both hashes and
refuses the overwrite. The sanctioned way to change a released definition is to bump its version — the old
one stays resolvable.

This is why a version string can stand in for a content hash everywhere else. A cache key (REQ-CACHE-01)
records `worker@1.0.0`; an execution snapshot (REQ-VERSION-02) records the same. Both trust that
`worker@1.0.0` is content-stable — a trust the registry, not convention, enforces.

## What carries a version, and what doesn't

| Definition | Versioned? | How |
|---|---|---|
| Workflow | yes | its own `id@version`, registered directly |
| Worker | yes | its own `id@version`, registered directly |
| Contract | transitively | embedded in a Worker, hashed and versioned with it — no independent version |
| Tool | runtime only | no serializable definition type (ADR 0008); a tool's `Version()` is recorded in the cache key (`cache.Inputs.ToolVersions`), not the registry |

Semver validation is hand-rolled on the official SemVer 2.0.0 grammar (no dependency, matching the project's
stance on small surfaces). `latest`, `1.0`, `v1.0.0`, and leading-zero forms are all rejected at
registration, before they can pollute the store.

## Executions pin, replay reads the pin

At start, an execution records the content hash of every worker it used
(`engine.Snapshot.DefinitionHashes`, computed by `registry.DefinitionHashes(wf)`). Audit
(`replay.Timeline.DefinitionHashes`) reads that pinned record — and, because the auditor holds no registry
reference at all, it *cannot* consult "latest" even by accident. An old execution audits back to the exact
definitions it ran, however far the registry has moved on since.

The field is `omitempty`: a run not driven by a registry (a bare test, an ad-hoc invocation) pins nothing
and writes a byte-identical snapshot to before — the event-log hash chain over existing runs is unchanged.

## Portable bundles

`Registry.Export(name, version)` bundles a workflow and every worker it references into one tar archive of
canonical JSON; `registry.Import` reads it back. Because entries are canonical and import recomputes each
hash, the round-trip is hash-identical (REQ-VERSION-03, REQ-DEF-02) — a bundle exported here imports
elsewhere as provably the same definitions.

Secrets never travel in a bundle. A definition holds only secret **references** (`${env:NAME}` — the name,
never the value; NFR-SEC-01), and Export resolves nothing, so no value can appear. The references are kept
on purpose: they are how the importer learns which environment variables to supply. Stripping them would
make the bundle unusable, so "secrets excluded" means *resolved values never appear*, not *references
removed*.

# ADR 0013: Connections model — provider and source references, forges never Core

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

Through M2.2, the interface configures external systems through a **hardcoded field list**
(`ui/src/components/SettingsModal.tsx`): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GITHUB_AUTH_HEADER`, and
`WEE_WORKSPACE_ROOT`, plus durable base URLs for OpenAI/Anthropic in `.workflow/settings.json` (ADR 0012).
There is no way to add a provider the array does not already name (no Kimi/Moonshot), no GitLab/Bitbucket,
no public-remote source, and no unifying concept — every new integration means editing a constant.

The project owner asked for an **"add connection" surface**: a list of the integrations WEE can talk to
(model providers *and* change sources), each added, edited, and removed without a code change, with a clear
secret lifecycle (first save vs. already-set).

This is the single most dangerous request against the constitution. Two laws bound it:

- **PRIN-04 / VISION.** WEE "executes engineering processes," and *"GitHub is only one source adapter for
  the demo, not a product boundary"* — the flagship "should work from a local `git diff`, a public patch
  URL, GitLab, Bitbucket, or a self-hosted forge by changing workflow/tool configuration, not Core."
  ROADMAP M2.3 restates it: *"Change-source adapters stay workflow-defined, not Core-defined."* A
  `GitHubProvider` in `core/` would invert the positioning and violate PRIN-06 (minimalism).
- **PRIN-10 / NFR-SEC-01 / REQ-CTRL-05.** Secrets are references, never values — never serialized into
  settings, definitions, snapshots, events, exports, or logs, and never rendered back to a client.

The design fork worth recording: **what a "Connection" is, and where the line sits so forges never become
Core concepts and secrets never touch disk.**

## Decision

We introduce **Connections** as a control-plane concept — a named, reusable, **non-secret reference
bundle** — and pin the boundary that keeps them out of the engine.

1. **A Connection is a non-secret reference bundle.** It persists in `.workflow/settings.json` (extending
   ADR 0012's settings home; written temp-then-rename per NFR-CTRL-01) and records: a stable id, a display
   label, a `kind`, endpoint/base-URL fields, non-secret defaults (e.g. default org, default branch), and
   **which env-var / keychain entry holds its secret — never the secret value** (PRIN-10, NFR-SEC-01,
   consistent with REQ-CTRL-05).

2. **Two kinds, one boundary.**
   - **Provider connections** bind to the existing `Provider` registry (REQ-MODEL-01). OpenAI stays the
     default (REQ-MODEL-02); Anthropic is already shipped (REQ-MODEL-03); **Kimi / Moonshot is an
     OpenAI-compatible endpoint reached by base-URL override (REQ-MODEL-04) — no new provider code.** Any
     other OpenAI-compatible endpoint (Ollama, vLLM, local models) is the same path.
   - **Source connections** (GitHub, GitLab, Bitbucket, a local repository path, a public patch/diff URL)
     are **not** Core integrations. A source connection is a named credential + endpoint that **workflows
     consume through the generic HTTP / git / filesystem tools** (REQ-TOOL-\*). The engine gains **no
     forge-specific code** — this ADR pins the line VISION and ROADMAP M2.3 already drew.

3. **Presets are UI convenience data, not engine behavior.** The "add connection" list ships known presets
   — base URLs, expected token header shape, typical scopes — for OpenAI / Anthropic / Kimi / GitHub /
   GitLab / Bitbucket / local. Presets are pure client/settings metadata that pre-fill fields; they never
   add capability to `core/`.

4. **Secret lifecycle is presence-only.** A connection's secret is shown as **set / unset** (a badge plus a
   masked placeholder), never as its value. The action reads **"Save"** on first set and **"Update"** once
   set, with an explicit **"Clear"**. This is the existing write-only secret model (M1.14e, REQ-CTRL-05)
   surfaced per connection: the value is applied to the process in-memory and/or its env/keychain
   *reference* is recorded — it is never read back into the field, the DOM, or any log.

5. **Workflows reference a connection by id, resolved at run start.** A provider connection selects a
   Worker's provider + base URL; a source connection supplies a tool's base URL + secret reference.
   Resolution is recorded in the frozen snapshot (REQ-EVENT-04) as **references**, never secrets.

6. **What may and may not leak.** Connection ids, labels, and base URLs may appear in definitions,
   snapshots, and events; secret values never do (NFR-SEC-01). Removing a connection never rewrites or
   deletes recorded history.

## Consequences

- **Easier:** a user adds any model provider (including Kimi) with zero engine change; a forge or local
  repo is configured once and reused across workflows; the set/update/clear lifecycle is unambiguous; the
  constitution's forge boundary is now a written, citable rule rather than an implicit one.
- **Harder:** the settings schema grows and needs migration discipline (M2.6); the client must carry preset
  metadata; and reviewers must actively reject any forge/provider-specific code that tries to enter `core/`
  — the boundary is only as strong as the review that guards it.
- **Neutral / limits:** connections are single-workspace and single-user; **team-shared connections are
  M2.7**, and an OS-level credential store is M2.6 — neither is introduced here.
- **Revisit trigger:** any first-class forge/provider behavior in `core/`, an OS-level or shared credential
  store, or team-shared connections each needs a new ADR, not an amendment to this one.

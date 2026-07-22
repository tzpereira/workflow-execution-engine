# Spec — Connections

**Prefix:** `REQ-CONN` · **Status:** DRAFT (delivery M2.9) · **Principles:** PRIN-04, PRIN-06, PRIN-10 ·
**Decisions:** ADR 0013 (connections model), ADR 0012 (settings home), ADR 0006 (provider integration) ·
**Implementation:** `core/settings/`, `core/server/`, `ui/` (M2.9)

A **Connection** is a named, reusable, **non-secret reference bundle** the control plane stores so a user
configures an external system once and reuses it across workflows. Connections come in two kinds — **model
providers** and **change sources** — but they share one hard boundary: a connection never adds capability
to the engine and never holds a secret value. Model providers bind to the existing `Provider` interface;
change sources are consumed by generic workflow tools, so **forges never become Core concepts** (ADR 0013,
VISION, ROADMAP M2.3).

### REQ-CONN-01 — Connection as a non-secret reference bundle
The service shall let a user add, edit, and remove named Connections, persisting each to the workspace
settings as an id, label, kind, endpoint/base-URL fields, and non-secret defaults — and the env/keychain
**reference** for its secret, never the secret value.
- **Rationale:** PRIN-10 + REQ-CTRL-05 — durable configuration without ever serializing a secret; replaces
  the hardcoded field list the UI inventory found.
- **Delivered by:** M2.9. **Verified by:** `settings.TestSaveLoadRoundTrip`,
  `SettingsModal adds provider connections from presets...`.

### REQ-CONN-02 — Provider connections bind to the Provider registry
A provider Connection shall map to an existing `Provider` implementation (REQ-MODEL-01): OpenAI (default,
REQ-MODEL-02), Anthropic (REQ-MODEL-03), and any OpenAI-compatible endpoint — including **Kimi / Moonshot**
— reached via base-URL override (REQ-MODEL-04) with **no new provider code**.
- **Rationale:** PRIN-07 — adding a provider must not touch the engine; Kimi is REQ-MODEL-04, not a new
  implementation.
- **Delivered by:** M2.9. **Verified by:**
  `providers.TestConfiguredRegistersOpenAICompatibleProviderByConnectionID`.

### REQ-CONN-03 — Source connections are workflow-consumed, Core stays forge-agnostic
A source Connection (GitHub, GitLab, Bitbucket, a local repository path, or a public patch/diff URL) shall
be consumed by workflows **only** through the generic HTTP / git / filesystem tools (REQ-TOOL-\*); the
engine shall contain no forge-specific code.
- **Rationale:** PRIN-04 + PRIN-06 + VISION — "GitHub is only one source adapter, not a product boundary";
  ROADMAP M2.3 "change-source adapters stay workflow-defined, not Core-defined."
- **Delivered by:** M2.9. **Verified by:**
  `engine.TestToolExecutorResolvesConnectionPlaceholders`,
  `server.TestNoForgeNamedPackagesUnderCore`.

### REQ-CONN-04 — Secret lifecycle is presence-only
While a Connection has a secret configured, the UI shall show it as **set** (a badge plus a masked
placeholder) and offer **Update** and **Clear**; while it is unconfigured, the UI shall show **unset** and
offer **Save**. The UI shall never read a stored secret value back into a field, the DOM, or a log.
- **Rationale:** PRIN-10 / NFR-SEC-01 — a rendered secret can be shoulder-surfed, screenshotted, or logged;
  presence is shown, value never is. Surfaces the write-only model (M1.14e, REQ-CTRL-05) per connection.
- **Delivered by:** M2.9. **Verified by:** `SettingsModal adds provider connections from presets...`,
  `server.TestSecretsStatusReportsPresenceNotValue`.

### REQ-CONN-05 — Add-connection presets
When adding a Connection, the UI shall offer a list of known integrations with presets (base URL, expected
token header shape, typical scopes) as **client convenience metadata only**; a preset shall pre-fill fields
and never add engine capability.
- **Rationale:** PRIN-06 — the "add connection" surface guides the user without smuggling forge/provider
  behavior into Core (ADR 0013).
- **Delivered by:** M2.9. **Verified by:** `SettingsModal adds provider connections from presets...`.

### REQ-CONN-06 — Workflows reference connections by id, recorded as references
When a run starts, the service shall resolve each referenced Connection (a provider connection selecting a
Worker's provider + base URL; a source connection supplying a tool's base URL + secret reference) and record
the resolution in the frozen snapshot (REQ-EVENT-04) as **references only**, never secrets.
- **Rationale:** PRIN-01 — an audit answers "which provider/source did this run use" without exposing a
  secret; PRIN-10 keeps the value out of the record.
- **Delivered by:** M2.9. **Verified by:** `server.TestRunRecordsConnectionRefsWithoutSecretValues`.

### NFR-CONN-01 — Connection secrets never persist, render, or log
The service shall never write a Connection's secret value to `settings.json`, a definition, a snapshot, an
event, an export, or any log, and the client shall never render it; only the env/keychain reference and
non-secret fields are stored.
- **Rationale:** PRIN-10 / NFR-SEC-01 — the event log is exportable and hash-chained; a leaked secret would
  be permanent.
- **Delivered by:** M2.9. **Verified by:** `settings.TestSecretValueNeverPersisted`,
  `server.TestRunRecordsConnectionRefsWithoutSecretValues`,
  `SettingsModal adds provider connections from presets...`.

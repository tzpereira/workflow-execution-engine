# Spec — Security & Integrity

**Prefix:** `NFR-SEC` · **Status:** DRAFT (staged M1.4 → M2.7) · **Principles:** PRIN-09, PRIN-10 ·
**Decisions:** ADR 0004, ADR 0007

Integrity is structural (content addressing, hash-chained events); security is deny-by-default (sandboxes,
allowlists, secrets never serialized). This spec collects the cross-cutting requirements; the tool sandbox
itself is specified in [tools.md](tools.md) (REQ-TOOL-03).

### NFR-SEC-01 — Secrets are references, never values
The engine shall accept secrets (API keys, tokens) only as environment/keychain **references**; secret
values shall never be serialized into definitions, snapshots, events, exports, or logs. From the first
milestone that touches provider keys (M1.4), provider implementations shall never log request headers.
- **Rationale:** PRIN-10; the event log is exportable and hash-chained — a leaked secret would be
  permanent.
- **Delivered by:** M1.4 (provider hygiene), M1.6a (`${env:NAME}` tool-input secret references, redacted
  from event payloads, returned error text, and the resulting artifact content (a tool can legitimately echo
  back what it was given, e.g. `curl -v`'s stderr) — narrowly scoped to `ToolExecutor`'s own emit/error/result paths,
  not a general mechanism), M2.0 (full redaction pass across the whole engine), M2.4 (shared byte scanner
  used across runtime records and exported bundles). **Verified by:**
  `security.TestScanFilesForSecretsFindsForbiddenBytes`,
  `openai.TestNoKeyMaterialInExecutionRecord` (scanner over every file a real-provider run writes plus an
  exported bundle),
  `openai.TestNoHeaderInError` (M1.4); `engine.TestToolExecutionRecordNeverContainsEnvSecretValue` (M1.6a);
  full redaction pass _pending_ (M2.0).

### NFR-SEC-02 — Tamper-evident execution records
The engine shall detect any post-hoc modification of an execution's record: artifacts via content
addressing (REQ-ARTIFACT-01), history via the event hash chain (REQ-EVENT-03), configuration via the
frozen snapshot's hash (REQ-EVENT-04).
- **Delivered by:** M1.2 (artifacts) + M1.4 (chain retrofit). **Verified by:** store tests;
  `eventlog.TestVerifyDetectsTamper` / `TestVerifyDetectsGenesisBreak` (chain).

### NFR-SEC-03 — Untrusted workflow threat model
Before the engine runs workflows from untrusted sources (registry/templates/Phase 2 hosting), the project
shall maintain `docs/threat-model.md` covering: tool sandbox escape, allowlist bypass, malicious
definitions (schema bombs, path traversal in artifact types), secret exfiltration via tool calls, and
event-log poisoning — each with its mitigation and the milestone that ships it.
- **Delivered by:** M1.5 (`docs/threat-model.md` v1, all five topics with mitigations + shipping milestone +
  Phase 2 residuals), M2.7 (hardening review). **Verified by:** document review; red-team pass in M2.7
  (_pending_).

### NFR-SEC-04 — Responsible disclosure
The repository shall carry a `SECURITY.md` with a disclosure contact and response expectations before the
first public release (M1.15).
- **Delivered by:** M1.15. **Verified by:** file exists and is linked from README (_pending_).

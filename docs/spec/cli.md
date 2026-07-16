# Spec — CLI

**Prefix:** `REQ-CLI` · **Status:** STABLE (delivery M1.9) · **Principles:** PRIN-02, PRIN-05, PRIN-06 ·
**Implementation:** `cli/` (M1.9)

One static Go binary, `wee`, that feels like Git or Terraform: instant startup, everything works from the
terminal, no UI required. The CLI is a pure client of the engine and its event stream.

### REQ-CLI-01 — Command surface
The binary shall provide `run`, `replay`, `inspect`, `validate`, `export`, `cache`, `init`, `list`, and
(M1.11) `serve` — each wrapping its core package, with filled-in help text.
- **Delivered by:** M1.9 (+`serve` in M1.11). **Verified by:** _pending_.

### REQ-CLI-02 — Zero-config first run
`wee init && wee run examples/hello.yaml` shall work with only the default provider's key in the
environment (`OPENAI_API_KEY`; `ANTHROPIC_API_KEY` if the workflow selects Anthropic; none for a keyless
self-hosted endpoint per REQ-MODEL-04) — no other configuration.
- **Delivered by:** M1.9. **Verified by:** _pending_.

### REQ-CLI-03 — Dual output: human and machine
`wee run` shall render live per-node status (spinner→check, running cost, cache badges) for humans, and
with `--json` emit line-delimited JSON that matches the event schema exactly — the same stream the UI
consumes; never two sources of truth.
- **Rationale:** PRIN-02; the event stream is the one boundary.
- **Delivered by:** M1.9. **Verified by:** _pending_ (`--json` lines validate against the event schema).

### REQ-CLI-04 — Precise exit codes
The binary shall exit `0` on success, `1` on node failure, `2` on budget exceeded, `3` on validation
error, `130` on SIGINT.
- **Delivered by:** M1.9. **Verified by:** _pending_.

### NFR-CLI-01 — Instant startup
`wee --help` shall complete in under 50ms (measured).
- **Delivered by:** M1.9. **Verified by:** _pending_.

# Spec — Model Providers

**Prefix:** `REQ-MODEL` · **Status:** STABLE (delivery M1.4) · **Principles:** PRIN-05, PRIN-07 ·
**Decisions:** ADR 0006 · **Implementation:** `core/model/` (M1.4)

LLMs are an implementation detail. The engine talks to models through one provider-agnostic interface;
each provider is a thin, hand-rolled `net/http` client (official vendor SDKs rejected after audit —
ADR 0006, EXECUTION §1a). Vendor and transport types never leak past `core/model/<provider>/`.

### REQ-MODEL-01 — Provider-agnostic interface
The engine shall invoke models exclusively through a `Provider` interface — `Complete(ctx, messages,
params) → (Response, error)` — whose types carry no vendor- or transport-specific concepts; a registry
shall map a Worker's `provider` field to an implementation.
- **Rationale:** PRIN-07; swapping providers must never touch the engine.
- **Delivered by:** M1.4. **Verified by:** `core/model` `TestVendorTypesDoNotLeak` (import-boundary check: no
  `core/model/{openai,anthropic}` package imported outside itself and the single `core/model/providers`
  wiring site).

### REQ-MODEL-02 — OpenAI provider, hand-rolled, default
The engine shall provide an OpenAI `Provider` implemented on `net/http` against `POST
/v1/chat/completions`, reading `OPENAI_API_KEY`, returning token usage from the response body; OpenAI is
the **default provider** (cheaper).
- **Delivered by:** M1.4. **Verified by:** `openai.TestBaseURLOverrideTalksToStub`, `TestSendsBearerWhenKeyed`,
  `TestStatusMapping` (stubbed HTTP server).

### REQ-MODEL-03 — Anthropic provider, hand-rolled
The engine shall provide an Anthropic `Provider` implemented on `net/http` against `POST /v1/messages`
(headers `x-api-key`, `anthropic-version`), reading `ANTHROPIC_API_KEY`, returning token usage from the
response body.
- **Delivered by:** M1.4. **Verified by:** `anthropic.TestCompleteAgainstStub`, `TestStatusMapping`
  (stubbed HTTP server).

### REQ-MODEL-04 — Self-hosted models via configurable endpoint
The OpenAI provider shall accept a configurable base URL, so any OpenAI-compatible endpoint — Ollama, vLLM,
llama.cpp server — works as a provider with zero engine changes; the API key becomes optional when the
endpoint doesn't require one.
- **Rationale:** PRIN-05 + PRIN-07 — cheap/free local models for cheap nodes, paid APIs only where quality
  demands; ownership extends to the model layer. (Decision 2026-07-15: pulled into M1.4 from Phase 2.)
- **Delivered by:** M1.4. **Verified by:** `openai.TestBaseURLOverrideTalksToStub` (base-URL override,
  keyless, against a stub server); manual check against a local Ollama is optional, not CI.

### REQ-MODEL-05 — Transport errors map to engine retry classes
If a provider call fails with HTTP 429 or 5xx (or a timeout), then the provider shall classify the error
as **transient** so `core/engine/retry.go` owns backoff (honoring `Retry-After` when present); 4xx errors
other than 429 are **fatal**.
- **Rationale:** one retry brain (REQ-RUNTIME-03) — providers never implement their own loops.
- **Delivered by:** M1.4. **Verified by:** `openai.TestStatusMapping` (429/5xx→transient honoring
  `Retry-After`, 4xx→fatal), `anthropic.TestStatusMapping`; the engine maps provider classes in
  `WorkerExecutor` (`mapProviderError`).

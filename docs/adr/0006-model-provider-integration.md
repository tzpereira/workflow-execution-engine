# ADR 0006: Model providers via hand-rolled HTTP clients, no vendor SDKs

- **Status:** Accepted
- **Date:** 2026-07-15

## Context

M1.4 needs the engine to call real model APIs (Anthropic, OpenAI). The obvious route is the official Go
SDKs (`anthropics/anthropic-sdk-go`, `openai/openai-go`), and the project owner initially leaned that way.
Per the standing dependency-vetting rule (CONSTITUTION PRIN-07), both were audited before pinning
(full findings: EXECUTION.md §1a, "Model provider SDKs"). The audit found:

- **A hard blocker:** `anthropic-sdk-go` v1.57.0 requires `go 1.24` / toolchain 1.25.8; this module is
  `go 1.22` with a 1.22.12 toolchain locally and in CI — the SDK forces a Go upgrade everywhere.
- **Transitive bloat:** the Anthropic SDK pulls ~50 modules (full AWS SDK v2, Google Cloud API, gRPC,
  protobuf, OpenTelemetry, MCP go-sdk — for Bedrock/Vertex/MCP features this project doesn't use);
  `openai-go` pulls ~16 including the Azure identity stack.
- **A dropped dependency returns:** `tidwall/gjson`+`sjson` — removed by explicit decision during M1.3 —
  are transitive dependencies of *both* SDKs.

What the engine actually needs from a provider is one call: `Complete(ctx, messages, params)` returning the
full output plus token usage. Both vendor APIs are a single JSON `POST` with usage in the response body.
Streaming is unnecessary (outputs are validated whole against contract schemas — REQ-CONTRACT-01); retry/
backoff already lives in `core/engine/retry.go`; tools execute engine-side, not via provider-native
function-calling.

## Decision

We will integrate model providers with **hand-rolled `net/http` clients** — one per provider under
`core/model/<provider>/` — behind the provider-agnostic `Provider` interface (`core/model/provider.go`),
with **OpenAI as the default provider** and the OpenAI client's **base URL configurable** so any
OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp server) works as a self-hosted provider
(REQ-MODEL-01..05). No vendor SDK enters `go.mod`. Vendor and transport types never leak past their
package (enforced by a boundary test).

## Consequences

- **Easier:** zero new dependencies and no Go-version bump; full control of headers, error→retry-class
  mapping, and logging hygiene (NFR-SEC-01); self-hosted models come nearly free via the base-URL override;
  swapping or adding providers never touches the engine.
- **Harder:** we own the request/response structs for both APIs and must track upstream API changes
  (`anthropic-version` header pins Anthropic's; OpenAI's chat-completions surface is stable); no
  SDK-provided streaming or typed tool-calling helpers.
- **Revisit trigger:** if the project ever adopts provider-native function-calling instead of engine-side
  tools, the SDK question reopens — that is the one scenario where the SDKs pay their weight.

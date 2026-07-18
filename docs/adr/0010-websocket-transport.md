# ADR 0010: Live event transport revisited — WebSocket via `github.com/coder/websocket`

- **Status:** Accepted
- **Date:** 2026-07-18
- **Supersedes:** [ADR 0009](0009-live-event-transport.md)

## Context

[ADR 0009](0009-live-event-transport.md) picked Server-Sent Events for `wee serve`'s live stream, reasoning
that the channel is strictly server → client, so SSE's zero-dependency fit beat WebSocket's unused
full-duplex capability. That ADR was implemented, tested end-to-end (`core/server`, `cli/cmd/serve.go`,
`ui/src/liveClient.ts`), and shipped as part of M1.12.

The project owner then asked directly for WebSocket. Clarifying the reason (rather than assuming): the
driver is matching `spec/ui.md` REQ-UI-02's original wording — "HTTP + WebSocket" — literally, not a new
functional requirement for bidirectional control. The stream's shape is unchanged: the server still only
pushes events; the client still only listens. This ADR records that this is a deliberate reversal of ADR
0009's optimization, made with the tradeoff understood, not a discovery that SSE was wrong.

Per the project's process laws, a new third-party dependency gets vetted (PRIN-07) before entering
`go.mod`, with findings presented and the decision left to the project owner — never a unilateral swap. ADR
0009 already surveyed the field and named its preference if this exact revisit ever happened:
`github.com/coder/websocket` over `github.com/gorilla/websocket`, for a smaller API surface. Re-confirmed
now with a fresh diligence pass:

- **License:** ISC — permissive, redistributable.
- **Dependencies:** zero (no transitive `go.mod` growth beyond this one module).
- **Maintenance:** actively maintained (originally `nhooyr.io/websocket`, now maintained by Coder); latest
  tagged release v1.8.15; 790 known importers.
- **Quality:** RFC 6455 compliant, passes the autobahn WebSocket conformance test suite, zero-alloc
  reads/writes, first-class `context.Context` support throughout (`Read(ctx)`, `Write(ctx, ...)`) — fits this
  project's existing context-propagation style (`core/engine`, `core/model`) without adapting.
- **API shape:** `websocket.Accept(w, r, opts)` on the server, `websocket.Dial(ctx, url, opts)` on any Go
  client (used directly in this project's own manual smoke tests); a browser client needs nothing extra —
  the native `WebSocket` global.

This vetting is the PRIN-07 record for pinning it; the project owner confirmed both the library choice and
the decision to replace (not supplement) the SSE transport before implementation began.

## Decision

**Replace SSE with WebSocket, via `github.com/coder/websocket`.** `wee serve`'s `GET
/api/executions/{id}/events` route now upgrades to a WebSocket connection instead of holding an SSE
response open; each frame is one JSON-encoded `domain.Event`, byte-identical to one line of `wee run
--json` — the encoding is unchanged, only the framing mechanism is. The UI's `liveClient.ts` dials it with
the browser's built-in `WebSocket` in place of `EventSource`.

The route path and method (`GET .../events`) are unchanged — a WebSocket upgrade is still a `GET` request
with an `Upgrade` header, so no API surface moves. `POST /api/run` and the plain-JSON `GET /api/executions`
/ `GET /api/executions/{id}` routes are untouched; only the one live-stream route's transport changed.

Cross-origin handling moves from CORS headers (irrelevant to WebSocket — browsers don't apply CORS to the
WS handshake) to `AcceptOptions.OriginPatterns`, set to `["*"]` to preserve the same permissive local-dev-tool
policy `withCORS` already documented for the HTTP routes.

## Consequences

**Easier:**
- Matches REQ-UI-02's original text exactly — no wording refinement needed, no reader has to reconcile spec
  prose against an ADR's substitution.
- "WebSocket" is the more immediately recognized term for a live-execution viewer; anyone integrating
  against `wee serve` from outside this repo has one fewer concept to look up.
- The wire protocol has headroom for bidirectional use (pause/resume/steer) if a real requirement for it
  ever lands — no transport migration needed then, just a new message type.

**Harder / accepted regressions from ADR 0009 (disclosed, not silently absorbed):**
- **A real new dependency:** `github.com/coder/websocket` enters `go.mod` as a direct dependency. Vetted
  above; zero transitive deps of its own, so the dependency graph grows by exactly one module.
- **No automatic reconnect.** `EventSource` reconnects on a dropped connection without any client code;
  `WebSocket` does not — a drop is terminal, full stop, and `watchExecution`'s `onDone` now fires on *any*
  close, not just a clean one. Watching a run across a flaky connection is measurably less resilient than it
  was under ADR 0009. Accepted because this is a local dev tool (`wee serve` binds `127.0.0.1` by default),
  where a mid-run connection drop is a rare, developer-visible event, not a production reliability concern.
- **`go.mod`'s `go` directive moved from 1.22 to 1.23**, since `coder/websocket`'s own `go.mod` requires it.
  A minor, mechanical consequence of the dependency, not a deliberate language-version decision — noted here
  so it isn't mistaken for one.
- The stream is still, today, purely one-directional in practice — WebSocket's full-duplex capability is
  present in the protocol but unused. ADR 0009's original functional argument (the channel doesn't need it)
  remains true; it was simply outweighed by the wording-match preference above.

**Revisit trigger:** none anticipated in the reverse direction (back to SSE) — this was a deliberate,
informed choice, not a mistake to correct. If a genuine bidirectional control requirement (pause/resume/
steer mid-execution) materializes, it is now *additive* to this transport (new message types on the same
connection), not a new ADR.

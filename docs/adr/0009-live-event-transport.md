# ADR 0009: Live event transport (Server-Sent Events, not WebSocket)

- **Status:** Superseded by [ADR 0010](0010-websocket-transport.md)
- **Date:** 2026-07-18

> Superseded the same day: the project owner asked for WebSocket specifically, to match REQ-UI-02's
> original wording literally rather than take this ADR's zero-dependency refinement. Kept verbatim below —
> the reasoning was sound for the tradeoff it was optimizing for, and the record of *why* SSE was tried
> first, and *why* it was reversed, is exactly what the ADR process exists to preserve.

## Context

M1.12 delivers REQ-UI-02: while an execution runs, the UI renders node status, data flow, and artifacts
**live**, driven solely by the `wee serve` event stream, with no visible polling delay/jank. `wee serve`
must expose the *same* event schema `wee run --json` already emits (M1.9) — `domain.Event` as
line-delimited JSON — because the UI is a pure client of that one stream, never a second source of truth
(PRIN-02).

`docs/spec/ui.md` REQ-UI-02 names the transport in prose as "HTTP + WebSocket". That wording predates the
implementation and describes the *intent* (a pushed, not polled, stream), not a pinned mechanism. Choosing
the actual transport is a contested, hard-to-reverse decision (it fixes both a server dependency and the
browser-side client API, and the UI's live layer is built against whichever we pick), so it gets an ADR
before it is pinned — per the project's process laws.

The decisive property of this stream: it is **strictly server → client**. The engine pushes
`ExecutionStarted`, `WorkerStarted`, `ToolCalled`, `ArtifactCreated`, `WorkerFinished`, … as they happen;
the UI only consumes them. It never needs to send messages back up the *same* channel mid-execution.
Control actions the UI does initiate (start a run) are ordinary one-shot HTTP requests (`POST /api/run`),
not messages multiplexed onto the event stream.

Three options were weighed:

1. **Server-Sent Events (SSE)** — a long-lived `text/event-stream` HTTP response, `data: <json>\n\n` per
   event. Server side is pure `net/http` + `http.Flusher` (**zero dependencies**). Client side is the
   browser's built-in `EventSource` (**zero dependencies**, auto-reconnect included). One-directional
   (server → client) by design.
2. **WebSocket via `github.com/coder/websocket`** (formerly `nhooyr.io/websocket`) — matches the spec's
   literal wording; full-duplex. Minimal, modern, few transitive deps, but still **a new `go.mod`
   dependency** to vet and pin (PRIN-07).
3. **WebSocket via `github.com/gorilla/websocket`** — the long-standing de-facto library; also a new
   `go.mod` dependency, larger API surface, more than this consume-only stream needs.

## Decision

**Pin SSE (option 1).** `wee serve` streams events as Server-Sent Events over `net/http`; the UI consumes
them with the browser's native `EventSource`.

Rationale, in priority order:

- **The stream is one-directional; SSE fits it exactly.** WebSocket buys full-duplex framing this feature
  has no use for. Choosing it would add a dependency to carry capability we never exercise.
- **Zero new dependencies, on both sides.** No `go.mod` entry to vet under PRIN-07; no client library in
  `package.json`. The one transport that avoids a dependency decision entirely is the one that also fits the
  problem best — a rare, clean alignment.
- **1:1 with the existing format.** `wee run --json` already emits `domain.Event` as one JSON object per
  line. SSE's frame is literally `data: ` + that same JSON + a blank line. The server reuses the exact
  encoding; the client `JSON.parse`s each `event.data`. No schema divergence is possible.
- **Genuinely pushed, not polled — from the client's side.** `EventSource` holds one connection and receives
  server-pushed frames; there is no client poll loop and no per-node request storm. That is precisely what
  REQ-UI-02's "no visible polling delay/jank" asks for. (Server-side, the handler tails the append-only
  event log — the same mechanism, and the same source of truth, `wee run` already streams from; that tail
  is an implementation detail the client never sees.)
- **Auto-reconnect is free.** `EventSource` reconnects on drop without client code; a dev tool watching a
  run benefits directly.

This is a deliberate, recorded refinement of REQ-UI-02's "HTTP + WebSocket" wording: SSE **is** HTTP, and
satisfies every testable part of the requirement (live node status, parallel lanes visible, cache hits
distinct, pushed not polled). `spec/ui.md` REQ-UI-02's delivery note is amended to cite this ADR so the
prose and the code agree.

## Consequences

**Easier:**
- No dependency added to `go.mod` or `package.json`; nothing to vet, pin, or later patch for CVEs.
- Server and client both use standard-library / built-in primitives (`net/http`, `EventSource`).
- The event schema cannot drift from `wee run --json`: same bytes, same `domain.Event`.

**Harder / accepted limits:**
- SSE is server → client only. Any future need for the UI to *push* into a live run over the same channel
  (interactive pause/resume/steer mid-execution) would need a separate control endpoint or a transport
  revisit. This is a non-goal for Phase 1 (no autonomous/interactive long-running loops — see CONSTITUTION
  non-goals), so the limit costs nothing now.
- Classic SSE over HTTP/1.1 is subject to the browser's ~6-connections-per-origin cap. For a single-workspace
  dev tool watching one execution at a time this is a non-issue; at scale it is mitigated by HTTP/2 (which
  multiplexes) and is noted here rather than solved early.
- The server-side live tail reads the append-only log without holding the writer's mutex — exactly as
  `wee run`'s streamer already does (`ReadAll` never locks). A concurrent reader can momentarily observe a
  torn trailing line; the handler treats a read error as transient and retries on the next tick rather than
  aborting the stream, so no event is lost or duplicated.

**Revisit trigger:** a concrete requirement for client → server messaging *within* a live execution (not a
separate request), or multi-hundred concurrent live viewers per origin on HTTP/1.1. Either would warrant a
new ADR proposing WebSocket (option 2 preferred over 3 for its smaller surface), superseding this one — not
an amendment to it.

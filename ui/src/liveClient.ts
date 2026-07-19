// The transport half of the live view: connect to `wee serve`'s WebSocket
// endpoint and fold frames through core/live's reducer. This is the only
// module that touches WebSocket/fetch directly — core/live.ts stays framework-
// and browser-API-free so the fold itself is unit-tested without a server
// (ADR 0010, github.com/coder/websocket on the server side).

import type { Audit } from './core/audit'
import type { WFEvent } from './core/live'

export interface WatchHandlers {
  onEvent: (ev: WFEvent) => void
  /** Called once the connection closes — either the server closed it on the
   *  execution's terminal event, or the connection dropped. Unlike
   *  EventSource, a browser WebSocket never auto-reconnects, so onDone always
   *  means "watching has stopped," not "reconnecting" (a disclosed regression
   *  from ADR 0009's SSE choice, accepted in ADR 0010). */
  onDone: () => void
}

export interface WatchOptions {
  baseUrl?: string
  /** Injectable for tests; defaults to the browser global. */
  WebSocketImpl?: typeof WebSocket
}

/** watchExecution opens the WebSocket stream for one execution id and returns
 *  a disposer that closes it. onDone fires once, when the connection closes
 *  for any reason (the server closes cleanly after ExecutionFinished —
 *  core/server/server.go). */
export function watchExecution(execId: string, handlers: WatchHandlers, opts: WatchOptions = {}): () => void {
  const WS = opts.WebSocketImpl ?? WebSocket
  const url = `${toWsUrl(opts.baseUrl ?? '')}/api/executions/${encodeURIComponent(execId)}/events`
  const ws = new WS(url)

  ws.onmessage = (m: MessageEvent<string>) => {
    try {
      handlers.onEvent(JSON.parse(m.data) as WFEvent)
    } catch {
      // A malformed frame is dropped, not fatal — the stream continues.
    }
  }
  ws.onclose = () => handlers.onDone()

  return () => ws.close()
}

/** toWsUrl rewrites an http(s) base URL to its ws(s) equivalent — the browser
 *  WebSocket constructor requires an absolute ws:// or wss:// URL and, unlike
 *  EventSource/fetch, rejects a relative path outright. Already-ws(s) or empty
 *  strings (test-only, always paired with an injected WebSocketImpl) pass
 *  through unchanged. */
function toWsUrl(baseUrl: string): string {
  if (baseUrl.startsWith('https://')) return `wss://${baseUrl.slice('https://'.length)}`
  if (baseUrl.startsWith('http://')) return `ws://${baseUrl.slice('http://'.length)}`
  return baseUrl
}

export interface RunResponse {
  executionId: string
}

/** startRun POSTs /api/run and returns the new execution id. workflow is a path
 *  resolved against the server's --dir (cli/cmd/serve.go), not an arbitrary
 *  client-side path — the server returns 400 if it can't be loaded. */
export async function startRun(baseUrl: string, workflow: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workflow }),
  })
  if (!res.ok) {
    throw new Error((await res.text()) || `POST /api/run failed: ${res.status}`)
  }
  const data = (await res.json()) as RunResponse
  return data.executionId
}

/** fetchAudit GETs /api/executions/{id}: the frozen Workflow/Workers plus every
 *  node's outcome and artifact bytes (core/server.Audit) — the Inspector's
 *  source for Contract/resolved-context/artifact-content, distinct from the
 *  evolving status the live WebSocket stream feeds (core/live.ts). Works for
 *  an in-flight execution too (snapshot.json is written before any node runs),
 *  though not-yet-finished nodes carry no artifact content yet. */
export async function fetchAudit(baseUrl: string, execId: string): Promise<Audit> {
  const res = await fetch(`${baseUrl}/api/executions/${encodeURIComponent(execId)}`)
  if (!res.ok) {
    throw new Error((await res.text()) || `GET /api/executions/${execId} failed: ${res.status}`)
  }
  return (await res.json()) as Audit
}

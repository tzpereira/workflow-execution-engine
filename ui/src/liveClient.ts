// The transport half of the live view: connect to `wee serve`'s SSE endpoint
// and fold frames through core/live's reducer. This is the only module that
// touches EventSource/fetch directly — core/live.ts stays framework- and
// browser-API-free so the fold itself is unit-tested without a server (ADR 0009).

import type { WFEvent } from './core/live'

export interface WatchHandlers {
  onEvent: (ev: WFEvent) => void
  /** Called once the stream ends — either the server closed it on the
   *  execution's terminal event, or the connection dropped for good. */
  onDone: () => void
}

export interface WatchOptions {
  baseUrl?: string
  /** Injectable for tests; defaults to the browser global. */
  EventSourceImpl?: typeof EventSource
}

/** watchExecution opens the SSE stream for one execution id and returns a
 *  disposer that closes it. EventSource auto-reconnects on a transient network
 *  drop; onDone fires only once the connection is in its terminal CLOSED state
 *  (the server closes cleanly after ExecutionFinished — core/server/server.go). */
export function watchExecution(execId: string, handlers: WatchHandlers, opts: WatchOptions = {}): () => void {
  const base = opts.baseUrl ?? ''
  const ES = opts.EventSourceImpl ?? EventSource
  const es = new ES(`${base}/api/executions/${encodeURIComponent(execId)}/events`)

  es.onmessage = (m: MessageEvent<string>) => {
    try {
      handlers.onEvent(JSON.parse(m.data) as WFEvent)
    } catch {
      // A malformed frame is dropped, not fatal — the stream continues.
    }
  }
  es.onerror = () => {
    if (es.readyState === ES.CLOSED) handlers.onDone()
  }

  return () => es.close()
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

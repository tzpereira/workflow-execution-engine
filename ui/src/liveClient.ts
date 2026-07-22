// The transport half of the live view: connect to `wee serve`'s WebSocket
// endpoint and fold frames through core/live's reducer. This is the only
// module that touches WebSocket/fetch directly — core/live.ts stays framework-
// and browser-API-free so the fold itself is unit-tested without a server
// (ADR 0010, github.com/coder/websocket on the server side).

import type { Audit, ExecutionSummary, ImportedTemplate, Settings, Template } from './core/audit'
import type { WFEvent } from './core/live'
import type { Worker } from './core/model'

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
 *  client-side path — the server returns 400 if it can't be loaded. inputs
 *  supplies values for the workflow's declared Inputs (REQ-INPUT-01); omit or
 *  pass undefined for a workflow with none. */
export async function startRun(
  baseUrl: string,
  workflow: string,
  inputs?: Record<string, string>
): Promise<string> {
  const res = await fetch(`${baseUrl}/api/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputs && Object.keys(inputs).length > 0 ? { workflow, inputs } : { workflow }),
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

/** fetchExecutions GETs /api/executions: every recorded and in-flight
 *  execution's summary (core/server.ExecutionSummary) — the history table's
 *  (M1.14) source, newest first (the server's own ordering). */
export async function fetchExecutions(baseUrl: string): Promise<ExecutionSummary[]> {
  const res = await fetch(`${baseUrl}/api/executions`)
  if (!res.ok) {
    throw new Error((await res.text()) || `GET /api/executions failed: ${res.status}`)
  }
  return (await res.json()) as ExecutionSummary[]
}

/** fetchTemplates GETs /api/templates: every `wee export` bundle the server's
 *  --templates directory holds (M1.14's gallery source). Empty (not an
 *  error) when the server wasn't started with --templates. */
export async function fetchTemplates(baseUrl: string): Promise<Template[]> {
  const res = await fetch(`${baseUrl}/api/templates`)
  if (!res.ok) {
    throw new Error((await res.text()) || `GET /api/templates failed: ${res.status}`)
  }
  return (await res.json()) as Template[]
}

/** importTemplate POSTs /api/templates/{name}/import: unpacks the bundle under
 *  the server workspace state dir and returns a workflow path POST /api/run can
 *  resolve, plus the workflow itself. */
export async function importTemplate(baseUrl: string, name: string): Promise<ImportedTemplate> {
  const res = await fetch(`${baseUrl}/api/templates/${encodeURIComponent(name)}/import`, { method: 'POST' })
  if (!res.ok) {
    throw new Error((await res.text()) || `POST /api/templates/${name}/import failed: ${res.status}`)
  }
  return (await res.json()) as ImportedTemplate
}

/** fetchWorkerVersions GETs /api/workers/{id}: every version of that Worker
 *  found on disk, oldest first (M1.14c) — the in-UI editor's source for both
 *  "what does this node's own version look like right now" and the
 *  version-history picker. dir scopes the scan to wherever the currently
 *  open workflow's sibling *.worker.yaml files actually live (a template
 *  import nests them under a subdirectory; a plain file import doesn't). */
export async function fetchWorkerVersions(baseUrl: string, id: string, dir: string): Promise<Worker[]> {
  const res = await fetch(`${baseUrl}/api/workers/${encodeURIComponent(id)}?dir=${encodeURIComponent(dir)}`)
  if (!res.ok) {
    throw new Error((await res.text()) || `GET /api/workers/${id} failed: ${res.status}`)
  }
  const data = (await res.json()) as { versions: Worker[] }
  return data.versions
}

/** saveWorker POSTs /api/workers: writes the edited Worker as a new version
 *  (the server ignores whatever Version is on `worker` and computes the next
 *  patch bump itself) and returns the saved copy, version included — the
 *  caller re-points the editing node's `worker` ref at it. */
export async function saveWorker(baseUrl: string, worker: Worker, dir: string): Promise<Worker> {
  const res = await fetch(`${baseUrl}/api/workers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ worker, dir }),
  })
  if (!res.ok) {
    throw new Error((await res.text()) || `POST /api/workers failed: ${res.status}`)
  }
  const data = (await res.json()) as { worker: Worker }
  return data.worker
}

/** fetchSecretsStatus GETs /api/secrets: which of the named env vars are
 *  currently set on the server process — never the values themselves (M1.14e).
 *  The Settings panel uses this to render "● set" / "○ not set" per field. */
export async function fetchSecretsStatus(baseUrl: string, names: string[]): Promise<Record<string, boolean>> {
  const res = await fetch(`${baseUrl}/api/secrets?names=${encodeURIComponent(names.join(','))}`)
  if (!res.ok) {
    throw new Error((await res.text()) || `GET /api/secrets failed: ${res.status}`)
  }
  return (await res.json()) as Record<string, boolean>
}

/** setSecret POSTs /api/secrets: applies name=value to the server process's
 *  own environment, in memory only — never written to disk (owner-confirmed
 *  2026-07-20). Takes effect starting with the next run; nothing already
 *  running is affected. */
export async function setSecret(baseUrl: string, name: string, value: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, value }),
  })
  if (!res.ok) {
    throw new Error((await res.text()) || `POST /api/secrets failed: ${res.status}`)
  }
}

/** unsetSecret DELETEs /api/secrets?name=...: clears a previously set env var. */
export async function unsetSecret(baseUrl: string, name: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/secrets?name=${encodeURIComponent(name)}`, { method: 'DELETE' })
  if (!res.ok) {
    throw new Error((await res.text()) || `DELETE /api/secrets failed: ${res.status}`)
  }
}

// --- Run controls (M2.2, REQ-CTRL-03) ---

/** cancelExecution POSTs /api/executions/{id}/cancel: cancels an in-flight run.
 *  The server cancels the run's context (REQ-RUNTIME-05); the run finalizes as
 *  cancelled and the live stream closes. A 409 means it was not running. */
export async function cancelExecution(baseUrl: string, id: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/executions/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
  if (!res.ok) {
    throw new Error((await res.text()) || `cancel ${id} failed: ${res.status}`)
  }
}

/** retryExecution POSTs /api/executions/{id}/retry: resumes the SAME execution,
 *  reusing completed nodes and re-running the rest. With `from`, that node and
 *  its downstream re-run too (retry-from-node). Returns the same id it acts on. */
export async function retryExecution(baseUrl: string, id: string, from?: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/executions/${encodeURIComponent(id)}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(from ? { from } : {}),
  })
  if (!res.ok) {
    throw new Error((await res.text()) || `retry ${id} failed: ${res.status}`)
  }
  return ((await res.json()) as RunResponse).executionId
}

/** reexecuteExecution POSTs /api/executions/{id}/reexecute: re-runs the frozen
 *  workflow as a NEW execution (cache reuses unchanged nodes). Returns the new
 *  execution id to watch. */
export async function reexecuteExecution(baseUrl: string, id: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/executions/${encodeURIComponent(id)}/reexecute`, { method: 'POST' })
  if (!res.ok) {
    throw new Error((await res.text()) || `reexecute ${id} failed: ${res.status}`)
  }
  return ((await res.json()) as RunResponse).executionId
}

export interface CacheClearRequest {
  all?: boolean
  keys?: string[]
  executionId?: string
  nodeId?: string
}

/** clearCache POSTs /api/cache/clear: clears everything (`all`), specific keys,
 *  or the keys a given execution (optionally one node) recorded. Returns how
 *  many entries were removed. */
export async function clearCache(baseUrl: string, req: CacheClearRequest): Promise<number> {
  const res = await fetch(`${baseUrl}/api/cache/clear`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    throw new Error((await res.text()) || `cache clear failed: ${res.status}`)
  }
  return ((await res.json()) as { removed: number }).removed
}

export async function approveExecution(baseUrl: string, id: string, checkpoint: string): Promise<void> {
  const res = await fetch(
    `${baseUrl}/api/executions/${encodeURIComponent(id)}/approvals/${encodeURIComponent(checkpoint)}/approve`,
    { method: 'POST' },
  )
  if (!res.ok) {
    throw new Error((await res.text()) || `approve ${checkpoint} failed: ${res.status}`)
  }
}

export async function rejectExecution(baseUrl: string, id: string, checkpoint: string): Promise<void> {
  const res = await fetch(
    `${baseUrl}/api/executions/${encodeURIComponent(id)}/approvals/${encodeURIComponent(checkpoint)}/reject`,
    { method: 'POST' },
  )
  if (!res.ok) {
    throw new Error((await res.text()) || `reject ${checkpoint} failed: ${res.status}`)
  }
}

/** bundleUrl is the GET download URL for an execution's portable bundle (tar) —
 *  used as an anchor href so the browser downloads it directly. */
export function bundleUrl(baseUrl: string, id: string): string {
  return `${baseUrl}/api/executions/${encodeURIComponent(id)}/bundle`
}

// --- Durable settings (M2.2, REQ-CTRL-05) ---

/** fetchSettings GETs /api/settings: the durable, non-secret control-plane
 *  config. Never returns a secret value. */
export async function fetchSettings(baseUrl: string): Promise<Settings> {
  const res = await fetch(`${baseUrl}/api/settings`)
  if (!res.ok) {
    throw new Error((await res.text()) || `GET /api/settings failed: ${res.status}`)
  }
  return (await res.json()) as Settings
}

/** saveSettings PUTs /api/settings and returns the persisted copy. Any secret
 *  value sent is dropped server-side (the Settings type has no field for one). */
export async function saveSettings(baseUrl: string, settings: Settings): Promise<Settings> {
  const res = await fetch(`${baseUrl}/api/settings`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) {
    throw new Error((await res.text()) || `PUT /api/settings failed: ${res.status}`)
  }
  return (await res.json()) as Settings
}

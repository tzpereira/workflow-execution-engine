import { useEffect, useState } from 'react'

import { bundleUrl } from '../liveClient'
import { useLive } from '../liveStore'

// RunControls is the durable control plane made visible (M2.2, REQ-CTRL-03): it
// acts on the execution the Run monitor is currently showing (live or loaded
// from History). While a run is in flight it offers Cancel and a live progress
// + liveness readout; once terminal it offers Resume (continue the same
// execution, reusing finished nodes), Re-run (a fresh execution reusing cache),
// Clear cache, and Export bundle. Every action goes through wee serve — nothing
// here re-derives engine state (PRIN-02).
export function RunControls() {
  const connected = useLive((s) => s.connected)
  const live = useLive((s) => s.live)
  const audit = useLive((s) => s.audit)
  const serverUrl = useLive((s) => s.serverUrl)
  const lastEventAt = useLive((s) => s.lastEventAt)
  const cancel = useLive((s) => s.cancel)
  const retry = useLive((s) => s.retry)
  const reexecute = useLive((s) => s.reexecute)
  const clearNodeCache = useLive((s) => s.clearNodeCache)

  const execId = live.executionId || audit?.executionId || null

  // Tick while running so the "idle Ns" liveness readout advances between
  // events; no timer once the run settles (a live tool, not a battery drain).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!connected) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [connected])

  if (!execId) return null

  const allNodes = Object.values(live.nodes)
  const total = allNodes.length
  const completed = allNodes.filter(
    (n) => n.status === 'succeeded' || n.status === 'cached' || n.status === 'failed',
  ).length
  const idleMs = connected && lastEventAt ? now - lastEventAt : 0
  const terminal = !connected && live.state !== 'idle' && live.state !== 'running'
  const resumable = terminal && (live.state === 'failed' || live.state === 'cancelled')

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {connected && (
        <span className="flex items-center gap-1.5 font-mono text-[11px] text-neutral-500" aria-label="run progress">
          {total > 0 && (
            <span className="hidden h-1 w-16 overflow-hidden rounded bg-neutral-200 md:block" aria-hidden="true">
              <span
                className="block h-full bg-blue-500"
                style={{ width: `${total === 0 ? 0 : Math.round((completed / total) * 100)}%` }}
              />
            </span>
          )}
          <span>
            {completed}/{total}
          </span>
          {idleMs > 3000 && <span className="text-amber-600">working… idle {Math.round(idleMs / 1000)}s</span>}
        </span>
      )}
      {connected && (
        <button type="button" className="btn" onClick={() => void cancel()} title="Cancel this run">
          Cancel
        </button>
      )}
      {resumable && (
        <button
          type="button"
          className="btn"
          onClick={() => void retry()}
          title="Resume this execution: reuse finished nodes, re-run the rest (does not re-pay for completed work)"
        >
          Resume
        </button>
      )}
      {terminal && (
        <button
          type="button"
          className="btn"
          onClick={() => void reexecute()}
          title="Re-run the frozen workflow as a new execution; unchanged nodes are served from cache"
        >
          Re-run
        </button>
      )}
      {terminal && (
        <button
          type="button"
          className="btn"
          onClick={() => void clearNodeCache()}
          title="Clear this execution's cached nodes so the next run recomputes them"
        >
          Clear cache
        </button>
      )}
      {execId && (
        <a
          className="btn"
          href={bundleUrl(serverUrl, execId)}
          title="Download a portable bundle (snapshot + events + artifacts) for this execution"
          data-testid="export-bundle"
        >
          Export
        </a>
      )}
    </div>
  )
}

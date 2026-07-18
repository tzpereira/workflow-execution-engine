import { useEffect, useState } from 'react'

import { bars, type NodeStatus } from '../core/live'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'

type Tab = 'timeline' | 'artifacts' | 'logs'

const barColor: Record<NodeStatus, string> = {
  pending: 'bg-neutral-200',
  running: 'bg-blue-500',
  succeeded: 'bg-emerald-500',
  cached: 'bg-amber-500', // distinct from a fresh success (REQ-UI-02)
  failed: 'bg-red-500',
}

// Timeline is the bottom panel with Timeline / Artifacts / Logs tabs. While a
// wee serve execution is being watched (liveStore), it renders a live Gantt
// (parallel lanes, cache hits visually distinct), a running cost ticker, and
// the artifacts/log lines as their events arrive. With no execution watched it
// falls back to the M1.11 static shape of the current workflow, so the panel
// is never empty chrome either way.
export function Timeline() {
  const [tab, setTab] = useState<Tab>('timeline')
  const nodes = useWorkspace((s) => s.nodes)
  const live = useLive((s) => s.live)
  const isWatching = live.state !== 'idle'

  // A running node's bar must keep growing between events — tick a `now`
  // while the run is in flight so its width stays live, not frozen at the
  // last event. No interval at all once the run settles (idle/succeeded/
  // failed/cancelled) — a live tool, not a battery drain.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (live.state !== 'running') return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [live.state])

  const rows = bars(live, now)
  const rowByID = Object.fromEntries(rows.map((b) => [b.id, b]))

  return (
    <section className="flex h-full flex-col border-t border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-2">
        <div className="flex items-center gap-1">
          {(['timeline', 'artifacts', 'logs'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-2 py-1.5 text-xs capitalize ${
                tab === t ? 'border-b-2 border-neutral-900 font-medium text-neutral-900' : 'text-neutral-500'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        {isWatching && (
          <div className="flex items-center gap-2 py-1 font-mono text-[11px] text-neutral-600">
            <span className="uppercase tracking-wide text-neutral-400">{live.state}</span>
            <span>${live.totalCostUsd.toFixed(4)}</span>
            <span>{live.totalTokens} tok</span>
            {live.savedCostUsd > 0 && <span className="text-amber-600">saved ${live.savedCostUsd.toFixed(4)}</span>}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2 text-xs text-neutral-600">
        {tab === 'timeline' &&
          (isWatching ? (
            <div className="space-y-1">
              {nodes.map((n) => {
                const bar = rowByID[n.id]
                const status = live.nodes[n.id]?.status ?? 'pending'
                return (
                  <div key={n.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate font-mono text-neutral-700">{n.id}</span>
                    <div className="relative h-4 flex-1 rounded bg-neutral-100">
                      {bar && (
                        <div
                          className={`absolute inset-y-0 rounded ${barColor[status]}`}
                          style={{ left: `${bar.left * 100}%`, width: `${Math.max(bar.width * 100, 1.5)}%` }}
                          title={status}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
              {nodes.length === 0 && <p className="text-neutral-400">no nodes in this workflow</p>}
            </div>
          ) : (
            <ol className="space-y-0.5">
              {nodes.map((n) => (
                <li key={n.id} className="font-mono">
                  {n.id}
                </li>
              ))}
              {nodes.length === 0 && <li className="text-neutral-400">no nodes yet</li>}
            </ol>
          ))}

        {tab === 'artifacts' &&
          (live.artifacts.length > 0 ? (
            <ul className="space-y-1 font-mono">
              {[...live.artifacts].reverse().map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-neutral-400">{new Date(a.at).toLocaleTimeString()}</span>
                  <span className="text-neutral-900">{a.nodeId}</span>
                  <span className="text-neutral-500">{a.type}</span>
                  <span className="truncate text-neutral-400">{a.hash.slice(0, 12)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-neutral-400">
              {isWatching ? 'no artifacts yet' : 'Artifacts appear here once a run streams in.'}
            </p>
          ))}

        {tab === 'logs' &&
          (live.events.length > 0 ? (
            <ul className="space-y-0.5 font-mono">
              {live.events.map((ev, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-neutral-400">{new Date(ev.timestamp).toLocaleTimeString()}</span>
                  <span className="text-neutral-900">{ev.type}</span>
                  {ev.nodeId && <span className="text-neutral-500">{ev.nodeId}</span>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-neutral-400">{isWatching ? 'no events yet' : 'Event logs appear here once a run streams in.'}</p>
          ))}
      </div>
    </section>
  )
}

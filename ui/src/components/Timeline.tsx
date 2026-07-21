import { useEffect, useState } from 'react'

import { bars, type NodeStatus } from '../core/live'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { EventList } from './EventList'
import { HistoryTable } from './HistoryTable'
import { MetricsPanel } from './MetricsPanel'

type Tab = 'timeline' | 'logs' | 'metrics' | 'history'

const barColor: Record<NodeStatus, string> = {
  pending: 'bg-neutral-200',
  running: 'bg-blue-500',
  succeeded: 'bg-emerald-500',
  cached: 'bg-amber-500', // distinct from a fresh success (REQ-UI-02)
  failed: 'bg-red-500',
}

// Timeline is the bottom panel with Timeline / Logs / Metrics / History tabs. While a
// wee serve execution is being watched (liveStore), it renders a live Gantt
// (parallel lanes, cache hits visually distinct), a running cost ticker, and
// the artifacts/log lines as their events arrive. With no execution watched it
// falls back to the M1.11 static shape of the current workflow, so the panel
// is never empty chrome either way.
export function Timeline({
  maximized = false,
  onToggleMaximize,
}: {
  maximized?: boolean
  onToggleMaximize?: () => void
}) {
  const [tab, setTab] = useState<Tab>('timeline')
  const nodes = useWorkspace((s) => s.nodes)
  const fileName = useWorkspace((s) => s.fileName)
  const live = useLive((s) => s.live)
  const audit = useLive((s) => s.audit)
  const connected = useLive((s) => s.connected)
  const run = useLive((s) => s.run)
  const isWatching = live.state !== 'idle'
  const canRetry = live.state === 'failed' && !connected && fileName !== null
  const failedNodes = Object.values(live.nodes).filter(
    (n) => n.status === 'failed',
  ).length
  const cachedNodes = Object.values(live.nodes).filter(
    (n) => n.status === 'cached',
  ).length
  const completedNodes = Object.values(live.nodes).filter(
    (n) => n.status === 'succeeded' || n.status === 'cached',
  ).length
  const budgetExceeded = live.events.some((e) => e.type === 'BudgetExceeded')
  const budgetWarning = live.events.some((e) => e.type === 'BudgetWarning')
  const retryCount = live.events.filter((e) => e.type === 'Retry').length
  const notice =
    live.state === 'cancelled'
      ? {
          tone: 'border-neutral-200 bg-neutral-50 text-neutral-700',
          title: 'Run cancelled',
          body: 'Completed artifacts remain inspectable; resume/retry controls appear when available.',
        }
      : budgetExceeded
        ? {
            tone: 'border-amber-200 bg-amber-50 text-amber-800',
            title: 'Budget exceeded',
            body: 'The runtime stopped before the next paid call.',
          }
        : failedNodes > 0
          ? {
              tone: 'border-red-200 bg-red-50 text-red-700',
              title: 'Run failed',
              body: 'Open the failed node or Logs tab for the exact event and payload.',
            }
          : budgetWarning
            ? {
                tone: 'border-amber-200 bg-amber-50 text-amber-800',
                title: 'Budget warning',
                body: 'This run crossed the warning threshold.',
              }
            : retryCount > 0
              ? {
                  tone: 'border-blue-200 bg-blue-50 text-blue-800',
                  title: 'Retry in progress',
                  body: `${retryCount} retr${retryCount === 1 ? 'y' : 'ies'} recorded so far.`,
                }
              : null

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
      <div className="flex flex-col gap-1 border-b border-neutral-200 px-2 py-1 md:flex-row md:items-center md:justify-between md:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden text-xs font-semibold uppercase text-neutral-500 md:inline">
            Run monitor
          </span>
          <div className="flex items-center gap-1">
            {(['timeline', 'logs', 'metrics', 'history'] as Tab[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-2 py-1.5 text-xs capitalize ${
                  tab === t
                    ? 'border-b-2 border-neutral-900 font-medium text-neutral-900'
                    : 'text-neutral-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="flex min-w-0 items-center justify-between gap-2 md:justify-end">
          {isWatching && (
            <div className="flex min-w-0 items-center gap-2 py-1 font-mono text-[11px] text-neutral-600">
              <span className="uppercase tracking-wide text-neutral-400">
                {live.state}
              </span>
              <span>
                {completedNodes}/{nodes.length} done
              </span>
              {cachedNodes > 0 && <span>{cachedNodes} cached</span>}
              {failedNodes > 0 && (
                <span className="text-red-700">{failedNodes} failed</span>
              )}
              <span>${live.totalCostUsd.toFixed(4)}</span>
              <span>{live.totalTokens} tok</span>
              {live.savedCostUsd > 0 && (
                <span className="text-amber-600">
                  saved ${live.savedCostUsd.toFixed(4)}
                </span>
              )}
            </div>
          )}
          {canRetry && (
            <button
              type="button"
              className="btn"
              onClick={() =>
                void run(
                  fileName,
                  nodes.map((n) => n.id),
                  audit?.inputs,
                )
              }
              title="Start a new execution with the same inputs; completed model nodes are reused from cache"
            >
              Retry failed
            </button>
          )}
          {onToggleMaximize && (
            <button
              type="button"
              className="btn"
              onClick={onToggleMaximize}
              title={maximized ? 'Restore panel height' : 'Maximize this panel'}
            >
              {maximized ? 'restore' : 'maximize'}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-2 text-xs text-neutral-600">
        {notice && (
          <div className={`mb-2 rounded border px-2 py-1 ${notice.tone}`}>
            <div className="font-medium">{notice.title}</div>
            <div>{notice.body}</div>
          </div>
        )}

        {tab === 'timeline' &&
          (isWatching ? (
            <div className="space-y-1">
              {nodes.map((n) => {
                const bar = rowByID[n.id]
                const status = live.nodes[n.id]?.status ?? 'pending'
                return (
                  <div key={n.id} className="flex items-center gap-2">
                    <span className="w-24 shrink-0 truncate font-mono text-neutral-700">
                      {n.id}
                    </span>
                    <div className="relative h-4 flex-1 rounded bg-neutral-100">
                      {bar && (
                        <div
                          className={`absolute inset-y-0 rounded ${barColor[status]}`}
                          style={{
                            left: `${bar.left * 100}%`,
                            width: `${Math.max(bar.width * 100, 1.5)}%`,
                          }}
                          title={status}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
              {nodes.length === 0 && (
                <p className="text-neutral-400">no nodes in this workflow</p>
              )}
            </div>
          ) : (
            <ol className="space-y-0.5">
              {nodes.map((n) => (
                <li key={n.id} className="font-mono">
                  {n.id}
                </li>
              ))}
              {nodes.length === 0 && (
                <li className="text-neutral-400">no nodes yet</li>
              )}
            </ol>
          ))}

        {tab === 'logs' &&
          (live.events.length > 0 ? (
            <EventList
              events={live.events}
              nodeOptions={nodes.map((n) => n.id)}
            />
          ) : (
            <p className="text-neutral-400">
              {isWatching
                ? 'no events yet'
                : 'Event logs appear here once a run streams in.'}
            </p>
          ))}

        {tab === 'metrics' && <MetricsPanel audit={audit} />}

        {tab === 'history' && <HistoryTable />}
      </div>
    </section>
  )
}

import { useEffect, useState } from 'react'

import { useLive } from '../liveStore'

type SortKey = 'workflow' | 'state' | 'spentCostUsd' | 'durationMs'
type SortDir = 'asc' | 'desc'

// HistoryTable is the Timeline area's History tab (M1.14, "cross-execution
// history table, sortable columns for cost/duration/status"): every recorded
// or in-flight execution (GET /api/executions), sortable, and clicking a row
// loads it via loadHistorical — reusing the same Timeline/Inspector/Metrics
// panels a live watch feeds, since `live`/`audit` don't distinguish a
// WebSocket fold from a one-shot replay of a finished run's own events.
export function HistoryTable() {
  const executions = useLive((s) => s.executions)
  const executionsError = useLive((s) => s.executionsError)
  const loadExecutions = useLive((s) => s.loadExecutions)
  const loadHistorical = useLive((s) => s.loadHistorical)
  const [sortKey, setSortKey] = useState<SortKey>('workflow')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    void loadExecutions()
  }, [loadExecutions])

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sorted = [...executions].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1
    const av = a[sortKey]
    const bv = b[sortKey]
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
    return String(av).localeCompare(String(bv)) * dir
  })

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-neutral-400">{executions.length} execution(s)</span>
        <button type="button" className="btn" onClick={() => void loadExecutions()}>
          refresh
        </button>
      </div>
      {executionsError && <p className="mb-1.5 text-red-600">{executionsError}</p>}
      <table className="w-full border-collapse text-left font-mono text-[11px]">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <SortableHeader label="workflow" sortKey="workflow" active={sortKey} dir={sortDir} onSort={toggleSort} />
            <th className="py-1 pr-2 font-medium">id</th>
            <SortableHeader label="status" sortKey="state" active={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableHeader label="cost" sortKey="spentCostUsd" active={sortKey} dir={sortDir} onSort={toggleSort} />
            <SortableHeader label="duration" sortKey="durationMs" active={sortKey} dir={sortDir} onSort={toggleSort} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => (
            <tr
              key={e.id}
              className="history-row cursor-pointer border-b border-neutral-100 text-neutral-700 hover:bg-neutral-50"
              onClick={() => void loadHistorical(e.id)}
            >
              <td className="py-1 pr-2 text-neutral-900">
                {e.workflow}
                <span className="text-neutral-400">@{e.version}</span>
              </td>
              <td className="py-1 pr-2 truncate">{e.id}</td>
              <td className="py-1 pr-2">{e.state}</td>
              <td className="py-1 pr-2">${e.spentCostUsd.toFixed(4)}</td>
              <td className="py-1">{fmtMs(e.durationMs)}</td>
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr>
              <td colSpan={5} className="py-2 text-neutral-400">
                no executions recorded yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function fmtMs(ms: number): string {
  if (ms <= 0) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function SortableHeader({
  label,
  sortKey,
  active,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  active: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
}) {
  const isActive = active === sortKey
  return (
    <th className="py-1 pr-2 font-medium">
      <button type="button" onClick={() => onSort(sortKey)} className="flex items-center gap-0.5 hover:text-neutral-900">
        {label}
        {isActive && <span>{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}

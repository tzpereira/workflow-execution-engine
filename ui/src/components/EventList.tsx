import { useMemo, useState } from 'react'

import type { WFEvent } from '../core/live'

// EventList is the shared event-log view (REQ-UI-03 events, M1.13's event log
// task): filterable by node id and event type, raw payload expandable per row.
// Used both scoped to one node (Inspector, fixedNodeId set — no filter chrome,
// there is nothing to filter) and globally (Timeline's Logs tab, both filters
// shown).
export function EventList({ events, nodeOptions, fixedNodeId }: { events: WFEvent[]; nodeOptions?: string[]; fixedNodeId?: string }) {
  const [nodeFilter, setNodeFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())

  const activeNodeFilter = fixedNodeId ?? nodeFilter
  const types = useMemo(() => Array.from(new Set(events.map((e) => e.type))).sort(), [events])

  const rows = events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => (!activeNodeFilter || e.nodeId === activeNodeFilter) && (!typeFilter || e.type === typeFilter))

  function toggle(i: number) {
    setExpanded((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  return (
    <div>
      {!fixedNodeId && (
        <div className="mb-1.5 flex gap-1.5">
          {nodeOptions && nodeOptions.length > 0 && (
            <select
              value={nodeFilter}
              onChange={(e) => setNodeFilter(e.target.value)}
              aria-label="filter by node"
              className="rounded border border-neutral-300 px-1 py-0.5 font-mono text-[11px] text-neutral-600"
            >
              <option value="">all nodes</option>
              {nodeOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          )}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="filter by event type"
            className="rounded border border-neutral-300 px-1 py-0.5 font-mono text-[11px] text-neutral-600"
          >
            <option value="">all types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      <ul className="space-y-0.5 font-mono text-[11px]">
        {rows.map(({ e, i }) => (
          <li key={i}>
            <button type="button" onClick={() => toggle(i)} className="flex w-full items-center gap-2 text-left hover:bg-neutral-50">
              <span className="text-neutral-400">{new Date(e.timestamp).toLocaleTimeString()}</span>
              <span className="text-neutral-900">{e.type}</span>
              {e.nodeId && <span className="text-neutral-500">{e.nodeId}</span>}
              {e.payload && <span className="ml-auto text-neutral-300">{expanded.has(i) ? '▾' : '▸'}</span>}
            </button>
            {expanded.has(i) && e.payload && (
              <pre className="ml-4 overflow-auto rounded bg-neutral-50 p-1.5 text-[10px] text-neutral-600">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            )}
          </li>
        ))}
        {rows.length === 0 && <li className="text-neutral-400">no events</li>}
      </ul>
    </div>
  )
}

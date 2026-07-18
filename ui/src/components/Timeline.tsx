import { useState } from 'react'

import { useWorkspace } from '../store'

type Tab = 'timeline' | 'artifacts' | 'logs'

// Timeline is the bottom panel with Timeline / Artifacts / Logs tabs. Live
// execution fills these from the wee serve event stream in M1.12; in M1.11 they
// show the static shape of the current workflow so the panel is real, not empty
// chrome.
export function Timeline() {
  const [tab, setTab] = useState<Tab>('timeline')
  const nodes = useWorkspace((s) => s.nodes)

  return (
    <section className="flex h-full flex-col border-t border-neutral-200 bg-white">
      <div className="flex items-center gap-1 border-b border-neutral-200 px-2">
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
      <div className="flex-1 overflow-auto p-2 text-xs text-neutral-600">
        {tab === 'timeline' && (
          <ol className="space-y-0.5">
            {nodes.map((n) => (
              <li key={n.id} className="font-mono">
                {n.id}
              </li>
            ))}
            {nodes.length === 0 && <li className="text-neutral-400">no nodes yet</li>}
          </ol>
        )}
        {tab === 'artifacts' && <p className="text-neutral-400">Artifacts appear here once a run streams in (M1.12).</p>}
        {tab === 'logs' && <p className="text-neutral-400">Event logs appear here once a run streams in (M1.12).</p>}
      </div>
    </section>
  )
}

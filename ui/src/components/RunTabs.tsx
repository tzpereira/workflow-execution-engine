import { signal } from '../core/status'
import { useLive } from '../liveStore'

export function RunTabs() {
  const tabs = useLive((s) => s.tabs)
  const activeTabId = useLive((s) => s.activeTabId)
  const switchTab = useLive((s) => s.switchTab)
  const closeTab = useLive((s) => s.closeTab)

  if (tabs.length === 0) return null

  return (
    <div className="flex h-9 min-w-0 items-end gap-1 border-b border-neutral-200 bg-neutral-100 px-2 pt-1 md:px-3">
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          const state = tab.live.state
          const tabSignal = signal(tab.connected ? 'watching' : state)
          return (
            <div
              key={tab.id}
              className={`flex h-8 max-w-52 shrink-0 items-center gap-1.5 border px-2 text-xs ${
                active
                  ? 'border-neutral-200 border-b-white bg-white text-neutral-900'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-600'
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5"
                onClick={() => switchTab(tab.id)}
                title={tab.id}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${tabSignal.dotClass}`}
                  aria-hidden="true"
                />
                <span className="truncate font-mono">{tab.label}</span>
              </button>
              <button
                type="button"
                className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                onClick={() => closeTab(tab.id)}
                title="Close run tab"
                aria-label={`Close run ${tab.id}`}
              >
                ×
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

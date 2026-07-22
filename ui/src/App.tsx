import { useEffect, useState } from 'react'

import { Canvas } from './components/Canvas'
import { CommandPalette } from './components/CommandPalette'
import { Inspector } from './components/Inspector'
import { ResizeHandle } from './components/ResizeHandle'
import { RunTabs } from './components/RunTabs'
import { SettingsModal } from './components/SettingsModal'
import { TemplateGallery } from './components/TemplateGallery'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'
import { usePersistedSize } from './core/resizable'
import { useWorkspace } from './store'

// App is the single workspace — one screen, no router, no page navigation
// (VISION UI Philosophy). Toolbar on top, Canvas center, Inspector right,
// Timeline bottom, ⌘K command palette and the Template gallery over
// everything.
export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [inspectorWidth, setInspectorWidth] = usePersistedSize(
    'wee.inspectorWidth',
    320,
    240,
    640,
  )
  const [timelineHeight, setTimelineHeight] = usePersistedSize(
    'wee.timelineHeight',
    192,
    120,
    600,
  )
  const [timelineMaximized, setTimelineMaximized] = useState(false)
  const selectedNodeId = useWorkspace((s) => s.selectedNodeId)
  const selectNode = useWorkspace((s) => s.selectNode)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app-shell flex h-screen flex-col bg-neutral-50 text-neutral-900">
      <RunTabs />
      <Toolbar
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenTemplates={() => setGalleryOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1" aria-label="Canvas">
          <Canvas />
        </main>
        <div className="hidden md:contents">
          <ResizeHandle
            axis="x"
            onDelta={(d) => setInspectorWidth(inspectorWidth - d)}
          />
          <Inspector width={inspectorWidth} />
        </div>
      </div>
      {!timelineMaximized && (
        <ResizeHandle
          axis="y"
          onDelta={(d) => setTimelineHeight(timelineHeight - d)}
        />
      )}
      <div
        className="shrink-0"
        style={{ height: timelineMaximized ? '70vh' : timelineHeight }}
      >
        <Timeline
          maximized={timelineMaximized}
          onToggleMaximize={() => setTimelineMaximized((m) => !m)}
        />
      </div>
      {selectedNodeId && (
        <div className="fixed inset-x-0 bottom-0 top-20 z-30 md:hidden">
          <button
            type="button"
            className="absolute right-2 top-1 z-10 flex h-7 w-7 items-center justify-center rounded border border-neutral-300 bg-white text-lg leading-none"
            onClick={() => selectNode(null)}
            title="Close node details"
            aria-label="Close node details"
          >
            ×
          </button>
          <Inspector width="100%" />
        </div>
      )}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TemplateGallery open={galleryOpen} onOpenChange={setGalleryOpen} />
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}

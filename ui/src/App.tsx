import { useEffect, useState } from 'react'

import { Canvas } from './components/Canvas'
import { CommandPalette } from './components/CommandPalette'
import { Inspector } from './components/Inspector'
import { ResizeHandle } from './components/ResizeHandle'
import { TemplateGallery } from './components/TemplateGallery'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'
import { usePersistedSize } from './core/resizable'

// App is the single workspace — one screen, no router, no page navigation
// (VISION UI Philosophy). Toolbar on top, Canvas center, Inspector right,
// Timeline bottom, ⌘K command palette and the Template gallery over
// everything.
export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [inspectorWidth, setInspectorWidth] = usePersistedSize('wee.inspectorWidth', 320, 240, 640)
  const [timelineHeight, setTimelineHeight] = usePersistedSize('wee.timelineHeight', 192, 120, 600)
  const [timelineMaximized, setTimelineMaximized] = useState(false)

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
    <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900">
      <Toolbar onOpenPalette={() => setPaletteOpen(true)} onOpenTemplates={() => setGalleryOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1" aria-label="Canvas">
          <Canvas />
        </main>
        <ResizeHandle axis="x" onDelta={(d) => setInspectorWidth(inspectorWidth - d)} />
        <Inspector width={inspectorWidth} />
      </div>
      {!timelineMaximized && <ResizeHandle axis="y" onDelta={(d) => setTimelineHeight(timelineHeight - d)} />}
      <div className="shrink-0" style={{ height: timelineMaximized ? '70vh' : timelineHeight }}>
        <Timeline maximized={timelineMaximized} onToggleMaximize={() => setTimelineMaximized((m) => !m)} />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TemplateGallery open={galleryOpen} onOpenChange={setGalleryOpen} />
    </div>
  )
}

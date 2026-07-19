import { useEffect, useState } from 'react'

import { Canvas } from './components/Canvas'
import { CommandPalette } from './components/CommandPalette'
import { Inspector } from './components/Inspector'
import { TemplateGallery } from './components/TemplateGallery'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'

// App is the single workspace — one screen, no router, no page navigation
// (VISION UI Philosophy). Toolbar on top, Canvas center, Inspector right,
// Timeline bottom, ⌘K command palette and the Template gallery over
// everything.
export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

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
        <Inspector />
      </div>
      <div className="h-48 shrink-0">
        <Timeline />
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <TemplateGallery open={galleryOpen} onOpenChange={setGalleryOpen} />
    </div>
  )
}

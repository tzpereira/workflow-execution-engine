import { useState } from 'react'

import { Canvas } from './components/Canvas'
import { Inspector } from './components/Inspector'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'

// App is the single workspace — one screen, no router, no page navigation
// (VISION UI Philosophy). Toolbar on top, Canvas center, Inspector right,
// Timeline bottom. The ⌘K command palette is mounted in the next step.
export default function App() {
  const [, setPaletteOpen] = useState(false)

  return (
    <div className="flex h-screen flex-col bg-neutral-50 text-neutral-900">
      <Toolbar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex min-h-0 flex-1">
        <main className="min-w-0 flex-1" aria-label="Canvas">
          <Canvas />
        </main>
        <Inspector />
      </div>
      <div className="h-48 shrink-0">
        <Timeline />
      </div>
    </div>
  )
}

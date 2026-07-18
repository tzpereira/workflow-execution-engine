import { useRef } from 'react'

import { useWorkspace } from '../store'

// Toolbar is the top bar: the workflow's id@version and the import/export
// controls. Import reads a Core YAML/JSON file into the canvas; Export writes
// the canvas back out as a Core definition — the round-trip REQ-UI-01 requires.
export function Toolbar({ onOpenPalette }: { onOpenPalette: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const meta = useWorkspace((s) => s.meta)
  const fileName = useWorkspace((s) => s.fileName)
  const error = useWorkspace((s) => s.error)
  const importFromPath = useWorkspace((s) => s.importFromPath)
  const exportText = useWorkspace((s) => s.exportText)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    importFromPath(await file.text(), file.name)
    e.target.value = '' // allow re-importing the same file
  }

  function onExport() {
    const format = fileName?.endsWith('.json') ? 'json' : 'yaml'
    const text = exportText(format)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${meta.id}.${format === 'json' ? 'json' : 'yaml'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <header className="flex h-11 items-center justify-between border-b border-neutral-200 bg-white px-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-neutral-900">{meta.id}</span>
        <span className="font-mono text-xs text-neutral-500">@{meta.version}</span>
        {error && <span className="text-xs text-red-600">· {error}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          ref={fileRef}
          type="file"
          accept=".yaml,.yml,.json"
          className="hidden"
          onChange={onFile}
          data-testid="import-input"
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <button type="button" className="btn" onClick={onExport}>
          Export
        </button>
        <button type="button" className="btn" onClick={onOpenPalette} title="Command palette (⌘K)">
          ⌘K
        </button>
      </div>
    </header>
  )
}

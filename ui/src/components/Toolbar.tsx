import { useRef, useState } from 'react'

import { downloadText } from '../download'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { RunInputsModal } from './RunInputsModal'

// Toolbar is the top bar: the workflow's id@version, import/export controls,
// and the Live control group — start/watch a `wee serve` execution and see its
// connection state (REQ-UI-02). Import reads a Core YAML/JSON file into the
// canvas; Export writes the canvas back out as a Core definition — the
// round-trip REQ-UI-01 requires.
export function Toolbar({ onOpenPalette, onOpenTemplates }: { onOpenPalette: () => void; onOpenTemplates: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const meta = useWorkspace((s) => s.meta)
  const fileName = useWorkspace((s) => s.fileName)
  const nodes = useWorkspace((s) => s.nodes)
  const error = useWorkspace((s) => s.error)
  const importFromPath = useWorkspace((s) => s.importFromPath)
  const exportText = useWorkspace((s) => s.exportText)

  const serverUrl = useLive((s) => s.serverUrl)
  const setServerUrl = useLive((s) => s.setServerUrl)
  const connected = useLive((s) => s.connected)
  const liveError = useLive((s) => s.error)
  const run = useLive((s) => s.run)
  const disconnect = useLive((s) => s.disconnect)
  const [inputsModalOpen, setInputsModalOpen] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    importFromPath(await file.text(), file.name)
    e.target.value = '' // allow re-importing the same file
  }

  function onExport() {
    const format = fileName?.endsWith('.json') ? 'json' : 'yaml'
    downloadText(exportText(format), `${meta.id}.${format === 'json' ? 'json' : 'yaml'}`)
  }

  // fileName is the imported file's basename (browser file inputs never expose
  // a directory). Run posts it as-is to `wee serve --dir`'s workflow resolver —
  // this only resolves when the server's --dir is the folder the file came
  // from. A mismatch surfaces as liveError from the server's 400, not a crash.
  //
  // A workflow with declared Inputs (REQ-INPUT-01) pauses here for the modal to
  // collect values first; one with none runs immediately, unchanged.
  function onRun() {
    if (!fileName) return
    if (meta.inputs && meta.inputs.length > 0) {
      setInputsModalOpen(true)
      return
    }
    void run(fileName, nodes.map((n) => n.id))
  }

  function onRunWithInputs(values: Record<string, string>) {
    setInputsModalOpen(false)
    if (!fileName) return
    void run(fileName, nodes.map((n) => n.id), values)
  }

  return (
    <header className="flex h-11 items-center justify-between border-b border-neutral-200 bg-white px-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-neutral-900">{meta.id}</span>
        <span className="font-mono text-xs text-neutral-500">@{meta.version}</span>
        {error && <span className="text-xs text-red-600">· {error}</span>}
        {liveError && <span className="text-xs text-red-600">· {liveError}</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-neutral-300'}`} />
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          className="w-40 rounded border border-neutral-300 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600"
          title="wee serve address"
          aria-label="wee serve address"
        />
        {connected ? (
          <button type="button" className="btn" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button type="button" className="btn" onClick={onRun} disabled={!fileName} title={fileName ? undefined : 'Import a workflow first'}>
            Run
          </button>
        )}
        <span className="mx-1 h-4 w-px bg-neutral-200" />
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
        <button type="button" className="btn" onClick={onOpenTemplates}>
          Templates
        </button>
        <button type="button" className="btn" onClick={onOpenPalette} title="Command palette (⌘K)">
          ⌘K
        </button>
      </div>
      {inputsModalOpen && meta.inputs && (
        <RunInputsModal
          inputs={meta.inputs}
          onCancel={() => setInputsModalOpen(false)}
          onSubmit={onRunWithInputs}
        />
      )}
    </header>
  )
}

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
export function Toolbar({
  onOpenPalette,
  onOpenTemplates,
  onOpenSettings,
}: {
  onOpenPalette: () => void
  onOpenTemplates: () => void
  onOpenSettings: () => void
}) {
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
    downloadText(
      exportText(format),
      `${meta.id}.${format === 'json' ? 'json' : 'yaml'}`,
    )
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
    void run(
      fileName,
      nodes.map((n) => n.id),
    )
  }

  function onRunWithInputs(values: Record<string, string>) {
    setInputsModalOpen(false)
    if (!fileName) return
    void run(
      fileName,
      nodes.map((n) => n.id),
      values,
    )
  }

  return (
    <header className="app-toolbar flex min-h-11 flex-col gap-1 border-b border-neutral-200 bg-white px-2 py-1 md:h-11 md:flex-row md:items-center md:justify-between md:gap-3 md:px-3 md:py-0">
      <div className="flex w-full min-w-0 items-baseline gap-2 md:w-auto">
        <span className="truncate text-sm font-semibold text-neutral-900">
          {meta.id}
        </span>
        <span className="font-mono text-xs text-neutral-500">
          @{meta.version}
        </span>
        {error && (
          <span className="truncate text-xs text-red-600">· {error}</span>
        )}
        {liveError && (
          <span className="truncate text-xs text-red-600">· {liveError}</span>
        )}
      </div>
      <div className="toolbar-controls items-center gap-1.5">
        <span
          className={`hidden h-1.5 w-1.5 rounded-full md:block ${connected ? 'bg-emerald-500' : 'bg-neutral-300'}`}
        />
        <input
          type="text"
          value={serverUrl}
          onChange={(e) => setServerUrl(e.target.value)}
          className="server-address w-full min-w-0 rounded border border-neutral-300 px-1.5 py-0.5 font-mono text-[11px] text-neutral-600 md:w-40 md:flex-none"
          title="wee serve address"
          aria-label="wee serve address"
        />
        {connected ? (
          <button type="button" className="btn" onClick={disconnect}>
            Disconnect
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={onRun}
            disabled={!fileName}
            title={fileName ? undefined : 'Import a workflow first'}
          >
            Run
          </button>
        )}
        <span className="mx-1 hidden h-4 w-px bg-neutral-200 md:block" />
        <input
          ref={fileRef}
          type="file"
          accept=".yaml,.yml,.json"
          className="hidden"
          onChange={onFile}
          data-testid="import-input"
        />
        <button
          type="button"
          className="btn"
          onClick={() => fileRef.current?.click()}
        >
          Import
        </button>
        <button
          type="button"
          className="btn"
          onClick={onExport}
          disabled={nodes.length === 0}
          title={
            nodes.length === 0
              ? 'Nothing to export yet — import or pick a template first'
              : undefined
          }
        >
          Export
        </button>
        <button type="button" className="btn" onClick={onOpenTemplates}>
          Templates
        </button>
        <button
          type="button"
          className="btn"
          onClick={onOpenSettings}
          title="API keys, GitHub token"
        >
          Settings
        </button>
        <button
          type="button"
          className="btn"
          onClick={onOpenPalette}
          title="Command palette (⌘K)"
        >
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

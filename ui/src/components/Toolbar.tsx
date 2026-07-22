import { useRef, useState } from 'react'

import { downloadText } from '../download'
import { signal, type SignalKey } from '../core/status'
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
  onOpenHelp = () => {},
  theme = 'light',
  onToggleTheme = () => {},
}: {
  onOpenPalette: () => void
  onOpenTemplates: () => void
  onOpenSettings: () => void
  onOpenHelp?: () => void
  theme?: 'light' | 'dark'
  onToggleTheme?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const meta = useWorkspace((s) => s.meta)
  const fileName = useWorkspace((s) => s.fileName)
  const nodes = useWorkspace((s) => s.nodes)
  const error = useWorkspace((s) => s.error)
  const importFromPath = useWorkspace((s) => s.importFromPath)
  const exportText = useWorkspace((s) => s.exportText)
  const markSaved = useWorkspace((s) => s.markSaved)

  const serverUrl = useLive((s) => s.serverUrl)
  const setServerUrl = useLive((s) => s.setServerUrl)
  const connected = useLive((s) => s.connected)
  const liveError = useLive((s) => s.error)
  const live = useLive((s) => s.live)
  const audit = useLive((s) => s.audit)
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
    markSaved()
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

  const hasWorkflow = nodes.length > 0
  const requiresInputs = (meta.inputs?.length ?? 0) > 0
  const providerReady = serverUrl.trim().length > 0
  const canRun = Boolean(fileName && providerReady)
  const runState =
    live.state === 'idle'
      ? connected
        ? 'watching'
        : hasWorkflow
          ? 'ready'
          : 'empty'
      : live.state
  const runSignal = signal(runState as SignalKey)
  const issueText = error ?? liveError
  const issue = issueText ? classifyIssue(issueText, live.state) : null
  const runButtonTitle = !fileName
    ? 'Import a workflow first'
    : !providerReady
      ? 'Set a wee serve address'
      : requiresInputs
        ? 'Run with workflow inputs'
        : undefined

  return (
    <header className="app-toolbar token-surface border-b px-2 py-1.5 md:px-3">
      <div className="flex min-h-10 flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${runSignal.dotClass}`}
            title={runSignal.label}
            aria-label={`run state ${runSignal.label}`}
          />
          <div className="min-w-0">
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="truncate text-sm font-semibold text-neutral-950">
                {meta.id}
              </span>
              <span className="font-mono text-xs text-neutral-500">
                @{meta.version}
              </span>
              {fileName && (
                <span className="hidden truncate rounded border border-neutral-200 px-1.5 py-0.5 font-mono text-[11px] text-neutral-500 lg:inline">
                  {fileName}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-2 font-mono text-[11px] text-neutral-500">
              <span>{nodes.length} nodes</span>
              <span>${meta.budget.maxCostUsd}</span>
              <span>{meta.budget.maxTokens} tok</span>
              {requiresInputs && <span>{meta.inputs?.length} inputs</span>}
              {live.executionId && (
                <span className="truncate">exec {live.executionId}</span>
              )}
              {audit?.inputs && Object.keys(audit.inputs).length > 0 && (
                <span>{Object.keys(audit.inputs).length} run inputs</span>
              )}
            </div>
          </div>
        </div>
        {issue && (
          <div
            className={`min-w-0 rounded border px-2 py-1 text-xs md:max-w-80 ${issue.className}`}
          >
            <div className="font-medium">{issue.label}</div>
            <span className="block truncate" title={issueText ?? undefined}>
              {issue.detail}
            </span>
          </div>
        )}
        <div className="toolbar-controls items-center gap-1.5">
          <span
            className={`hidden h-1.5 w-1.5 rounded-full md:block ${signal(connected ? 'connected' : 'disconnected').dotClass}`}
            title={connected ? 'connected' : 'not connected'}
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
              className="btn btn-primary"
              onClick={onRun}
              disabled={!canRun}
              title={runButtonTitle}
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
            title="Connections and runtime defaults"
          >
            Settings
          </button>
          <button
            type="button"
            className="btn"
            onClick={onToggleTheme}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
          <button type="button" className="btn" onClick={onOpenHelp}>
            Help
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

function classifyIssue(
  text: string,
  state: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled',
) {
  const lower = text.toLowerCase()
  const isRateLimit =
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('retry-after')
  const isBudget = lower.includes('budget') || lower.includes('cost limit')
  const isProvider =
    lower.includes('api key') ||
    lower.includes('provider') ||
    lower.includes('unauthorized') ||
    lower.includes('401')
  if (isRateLimit) {
    return {
      label: 'Rate limited',
      detail: text,
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }
  if (isBudget) {
    return {
      label: 'Budget stopped the run',
      detail: text,
      className: 'border-amber-200 bg-amber-50 text-amber-800',
    }
  }
  if (isProvider) {
    return {
      label: 'Provider setup needed',
      detail: text,
      className: 'border-red-200 bg-red-50 text-red-700',
    }
  }
  if (state === 'cancelled') {
    return {
      label: 'Run cancelled',
      detail: text,
      className: 'border-neutral-200 bg-neutral-50 text-neutral-700',
    }
  }
  return {
    label: 'Run failed',
    detail: text,
    className: 'border-red-200 bg-red-50 text-red-700',
  }
}

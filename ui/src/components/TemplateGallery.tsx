import { useEffect, useState } from 'react'

import { importTemplate } from '../liveClient'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`
  return `${ms}ms`
}

// TemplateGallery is the one-click-import surface M1.14/REQ-UI-05 asks for —
// every template is a real `wee export` bundle (no UI-only format), listed
// via GET /api/templates and materialized via POST /api/templates/{name}/
// import, which unpacks real YAML files under the server's workspace state dir
// and hands back the workflow — importing it here goes through the exact same
// importText path a file picked from disk would (PRIN-02, no second import
// mechanism). An overlay, same family as the ⌘K CommandPalette (M1.11) — a
// transient picker, not a panel someone lives in, so it isn't the "no modal"
// rule M1.13 set for the Inspector/Artifact viewer.
export function TemplateGallery({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const templates = useLive((s) => s.templates)
  const templatesError = useLive((s) => s.templatesError)
  const loadTemplates = useLive((s) => s.loadTemplates)
  const serverUrl = useLive((s) => s.serverUrl)
  const importText = useWorkspace((s) => s.importText)
  const [loading, setLoading] = useState(false)
  const [importingName, setImportingName] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (!cancelled) setLoading(true)
      })
      .then(loadTemplates)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, loadTemplates])

  if (!open) return null

  async function pick(name: string) {
    setImportingName(name)
    setImportError(null)
    try {
      const { workflowPath, workflow } = await importTemplate(serverUrl, name)
      importText(JSON.stringify(workflow), 'json', workflowPath)
      onOpenChange(false)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e))
    } finally {
      setImportingName(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-[42rem] max-w-[90vw] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
          <span className="text-sm font-semibold text-neutral-900">
            Templates
          </span>
          <button
            type="button"
            className="btn"
            onClick={() => onOpenChange(false)}
          >
            close
          </button>
        </div>
        <div className="max-h-96 overflow-auto p-3">
          {loading && (
            <div className="mb-2 rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-500">
              Loading templates from {serverUrl}
            </div>
          )}
          {templatesError && (
            <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              <div className="font-medium">Could not load templates</div>
              <div>{templatesError}</div>
            </div>
          )}
          {importError && (
            <div className="mb-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              <div className="font-medium">Import failed</div>
              <div>{importError}</div>
            </div>
          )}
          {templates.length === 0 && !templatesError && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No templates configured on this server. Start `wee serve` with
              --templates pointed at a directory of exported bundles.
            </div>
          )}
          <div className="grid grid-cols-1 gap-2">
            {templates.map((t) => {
              // Defensive: tools/inputs are server-guaranteed non-null arrays
              // (core/registry.DeriveTemplateFacts), but a client shouldn't
              // crash on .length if that guarantee ever drifts.
              const tools = t.tools ?? []
              const inputs = t.inputs ?? []
              const connections = t.requiredConnections ?? []
              return (
                <button
                  key={t.name}
                  type="button"
                  disabled={importingName !== null}
                  onClick={() => void pick(t.name)}
                  className="rounded-md border border-neutral-200 p-3 text-left hover:border-neutral-400 disabled:opacity-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-neutral-900">{t.name}</div>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                        t.writeCapable
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {t.writeCapable ? 'write-capable' : 'read-only'}
                    </span>
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-neutral-500">
                    {t.workflowId}@{t.version}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-400">
                    <span>
                      {t.nodeCount} node{t.nodeCount === 1 ? '' : 's'}
                    </span>
                    <span>≤ ${t.expectedCostUsd.toFixed(2)}</span>
                    <span>≤ {formatDuration(t.expectedDurationMs)}</span>
                    <span>
                      {tools.length > 0 ? tools.join(', ') : 'no tools'}
                    </span>
                    <span>
                      {connections.length > 0
                        ? `connections: ${connections.join(', ')}`
                        : 'no model connection'}
                    </span>
                  </div>
                  {inputs.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-t border-neutral-100 pt-1.5">
                      {inputs.map((input) => (
                        <li
                          key={input.name}
                          className="text-xs text-neutral-500"
                        >
                          <span className="font-mono text-neutral-700">
                            {input.name}
                          </span>
                          {input.required && (
                            <span className="ml-1 text-[10px] text-red-600">
                              required
                            </span>
                          )}
                          {input.description && (
                            <span> — {input.description}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {importingName === t.name && (
                    <div className="mt-1 text-xs text-neutral-400">
                      importing…
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

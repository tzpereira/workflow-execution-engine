import { useEffect, useState } from 'react'

import { importTemplate } from '../liveClient'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'

// TemplateGallery is the one-click-import surface M1.14/REQ-UI-05 asks for —
// every template is a real `wee export` bundle (no UI-only format), listed
// via GET /api/templates and materialized via POST /api/templates/{name}/
// import, which unpacks real YAML files under the server's --dir and hands
// back the workflow — importing it here goes through the exact same
// importText path a file picked from disk would (PRIN-02, no second import
// mechanism). An overlay, same family as the ⌘K CommandPalette (M1.11) — a
// transient picker, not a panel someone lives in, so it isn't the "no modal"
// rule M1.13 set for the Inspector/Artifact viewer.
export function TemplateGallery({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const templates = useLive((s) => s.templates)
  const templatesError = useLive((s) => s.templatesError)
  const loadTemplates = useLive((s) => s.loadTemplates)
  const serverUrl = useLive((s) => s.serverUrl)
  const importText = useWorkspace((s) => s.importText)
  const [importingName, setImportingName] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    if (open) void loadTemplates()
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
          <span className="text-sm font-semibold text-neutral-900">Templates</span>
          <button type="button" className="btn" onClick={() => onOpenChange(false)}>
            close
          </button>
        </div>
        <div className="max-h-96 overflow-auto p-3">
          {templatesError && <p className="mb-2 text-xs text-red-600">{templatesError}</p>}
          {importError && <p className="mb-2 text-xs text-red-600">{importError}</p>}
          {templates.length === 0 && !templatesError && (
            <p className="text-sm text-neutral-400">
              No templates configured on this server — start `wee serve` with --templates pointed at a
              directory of `wee export` bundles.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2">
            {templates.map((t) => (
              <button
                key={t.name}
                type="button"
                disabled={importingName !== null}
                onClick={() => void pick(t.name)}
                className="rounded-md border border-neutral-200 p-3 text-left hover:border-neutral-400 disabled:opacity-50"
              >
                <div className="font-medium text-neutral-900">{t.name}</div>
                <div className="mt-0.5 font-mono text-xs text-neutral-500">
                  {t.workflowId}@{t.version}
                </div>
                <div className="mt-1 text-xs text-neutral-400">
                  {t.nodeCount} node{t.nodeCount === 1 ? '' : 's'}
                </div>
                {importingName === t.name && <div className="mt-1 text-xs text-neutral-400">importing…</div>}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

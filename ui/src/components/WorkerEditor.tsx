import { useEffect, useState } from 'react'

import { fetchWorkerVersions, saveWorker } from '../liveClient'
import type { Worker } from '../core/model'

// WorkerEditor is M1.14c's Worker/Contract half — objective, constraints,
// tools, and Contract's rules/successCriteria/maxRetries/outputSchema,
// editable directly in the Inspector instead of only in hand-edited YAML.
// Saving never overwrites the file the edit started from: the server always
// mints a new version (owner-confirmed 2026-07-20), so a version-history
// picker doubles as the rollback control — picking an older entry just
// re-points this node's `worker:` ref at it, no data ever destroyed.
//
// List-shaped fields (constraints, tools, rules, successCriteria) are edited
// as one-per-line text — a full add/remove-per-item widget isn't worth the
// code for a v1; outputSchema is raw JSON text, since a visual JSON Schema
// builder is a separate, larger M2.5 deliverable (docs/EXECUTION.md M1.14c).
export function WorkerEditor({
  workerRef,
  dir,
  serverUrl,
  onWorkerRefChange,
  onWorkerLoaded,
}: {
  workerRef: string
  dir: string
  serverUrl: string
  onWorkerRefChange: (newRef: string) => void
  /** Called whenever the loaded/edited copy changes — lets a parent (the
   *  Context Policy editor, M1.14c) read this Worker's own default policy
   *  without duplicating the fetch. */
  onWorkerLoaded?: (worker: Worker) => void
}) {
  const [id] = workerRef.split('@')
  const [versions, setVersions] = useState<Worker[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Worker | null>(null)
  const [schemaText, setSchemaText] = useState('')
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    fetchWorkerVersions(serverUrl, id, dir)
      .then((vs) => {
        if (cancelled) return
        setVersions(vs)
        const current = vs.find((v) => `${v.id}@${v.version}` === workerRef) ?? vs[vs.length - 1]
        if (current) loadDraft(current)
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, dir, serverUrl])

  function loadDraft(w: Worker) {
    setDraft(w)
    setSchemaText(JSON.stringify(w.contract.outputSchema, null, 2))
    setSchemaError(null)
    setSavedNotice(null)
    onWorkerLoaded?.(w)
  }

  function pickVersion(version: string) {
    const w = versions?.find((v) => v.version === version)
    if (!w) return
    onWorkerRefChange(`${w.id}@${w.version}`)
    loadDraft(w)
  }

  function linesOf(text: string): string[] {
    return text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }

  async function onSave() {
    if (!draft) return
    let schema: Record<string, unknown>
    try {
      schema = JSON.parse(schemaText)
    } catch {
      setSchemaError('outputSchema is not valid JSON')
      return
    }
    setSchemaError(null)
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await saveWorker(serverUrl, { ...draft, contract: { ...draft.contract, outputSchema: schema } }, dir)
      setVersions((vs) => [...(vs ?? []), saved])
      onWorkerRefChange(`${saved.id}@${saved.version}`)
      loadDraft(saved)
      setSavedNotice(`saved as v${saved.version}`)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <p className="text-xs text-red-600">{loadError}</p>
  if (!draft) return <p className="text-xs text-neutral-400">loading…</p>

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <select
          value={draft.version}
          onChange={(e) => pickVersion(e.target.value)}
          className="rounded border border-neutral-300 px-1.5 py-0.5 font-mono text-xs"
          aria-label="Worker version"
        >
          {versions?.map((v) => (
            <option key={v.version} value={v.version}>
              {v.version}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={onSave} disabled={saving}>
          {saving ? 'saving…' : 'save as new version'}
        </button>
        {savedNotice && <span className="text-xs text-emerald-700">{savedNotice}</span>}
      </div>
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Objective</span>
        <textarea
          value={draft.objective}
          onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Constraints (one per line)</span>
        <textarea
          value={draft.constraints.join('\n')}
          onChange={(e) => setDraft({ ...draft, constraints: linesOf(e.target.value) })}
          rows={3}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Tools (one per line)</span>
        <textarea
          value={draft.tools.join('\n')}
          onChange={(e) => setDraft({ ...draft, tools: linesOf(e.target.value) })}
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Contract goal</span>
        <input
          type="text"
          value={draft.contract.goal}
          onChange={(e) => setDraft({ ...draft, contract: { ...draft.contract, goal: e.target.value } })}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Rules (one per line)</span>
        <textarea
          value={draft.contract.rules.join('\n')}
          onChange={(e) => setDraft({ ...draft, contract: { ...draft.contract, rules: linesOf(e.target.value) } })}
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Success criteria (one per line)</span>
        <textarea
          value={draft.contract.successCriteria.join('\n')}
          onChange={(e) => setDraft({ ...draft, contract: { ...draft.contract, successCriteria: linesOf(e.target.value) } })}
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Max retries</span>
        <input
          type="number"
          min={0}
          value={draft.contract.maxRetries}
          onChange={(e) => setDraft({ ...draft, contract: { ...draft.contract, maxRetries: Number(e.target.value) } })}
          className="mt-0.5 w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">Output schema (JSON)</span>
        <textarea
          value={schemaText}
          onChange={(e) => {
            setSchemaText(e.target.value)
            setSchemaError(null)
          }}
          rows={6}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-[11px]"
        />
        {schemaError && <p className="mt-0.5 text-xs text-red-600">{schemaError}</p>}
      </label>
    </div>
  )
}

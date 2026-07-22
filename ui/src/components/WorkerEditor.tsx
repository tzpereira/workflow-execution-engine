import type { RJSFSchema } from '@rjsf/utils'
import validator from '@rjsf/validator-ajv8'
import { useEffect, useState } from 'react'

import { fetchWorkerVersions, saveWorker } from '../liveClient'
import type { Worker } from '../core/model'
import { worker as workerSchema } from '../schemas'

// WorkerEditor is M1.14c's Worker/Contract half — objective, constraints,
// tools, and Contract's rules/successCriteria/maxRetries/outputSchema,
// editable directly in the Inspector instead of only in hand-edited YAML.
// Saving never overwrites the file the edit started from: the server always
// mints a new version (owner-confirmed 2026-07-20), so a version-history
// picker doubles as the rollback control — picking an older entry just
// re-points this node's `worker:` ref at it, no data ever destroyed. See the
// hint rendered next to the version picker below.
//
// List-shaped fields (constraints, tools, rules, successCriteria) are edited
// as one-per-line text — a full add/remove-per-item widget isn't worth the
// code for a v1; outputSchema stays raw JSON text (a visual JSON Schema
// builder is a separate, larger deliverable) but is now live-validated two
// ways (M2.3, "schema-aware fields"): the same @rjsf/validator-ajv8 instance
// SchemaForm.tsx already uses (no new dependency) checks the whole draft
// against the canonical worker schema (envelope — required fields, types,
// additionalProperties:false), and its exposed raw `ajv` instance separately
// try-compiles the outputSchema text (content — worker.schema.json only
// requires outputSchema to be *some* object, so the envelope check alone
// would accept a syntactically-fine but non-compilable schema; the server
// mirrors this exact two-check split in handleSaveWorker). Both are
// informational, not save-blocking: the server is the enforcement gate
// (defense in depth), so a live-validation false positive from client/server
// schema drift can never make a legitimately valid Worker unsaveable.
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
  const [envelopeErrors, setEnvelopeErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedNotice, setSavedNotice] = useState<string | null>(null)

  // Live, informational schema validation — debounced so typing stays smooth.
  // Two independent checks, mirroring the server (see the header comment):
  // (1) is schemaText a compilable JSON Schema — worker.schema.json's own
  // envelope check can't see into outputSchema's content; (2) does the whole
  // draft (with that parsed schema substituted in) satisfy the worker
  // envelope — required fields, types, additionalProperties:false.
  useEffect(() => {
    if (!draft) return
    const timer = setTimeout(() => {
      let parsedSchema: Record<string, unknown>
      try {
        parsedSchema = JSON.parse(schemaText) as Record<string, unknown>
      } catch {
        setSchemaError('outputSchema is not valid JSON')
        setEnvelopeErrors([])
        return
      }
      try {
        validator.ajv.compile(parsedSchema)
      } catch (e) {
        setSchemaError(
          `outputSchema does not compile as a JSON Schema: ${e instanceof Error ? e.message : String(e)}`,
        )
        setEnvelopeErrors([])
        return
      }
      setSchemaError(null)

      const candidate = {
        ...draft,
        contract: { ...draft.contract, outputSchema: parsedSchema },
      }
      const { errors } = validator.validateFormData(
        candidate,
        workerSchema as RJSFSchema,
      )
      setEnvelopeErrors(errors.map((e) => e.stack))
    }, 300)
    return () => clearTimeout(timer)
  }, [draft, schemaText])

  useEffect(() => {
    let cancelled = false
    fetchWorkerVersions(serverUrl, id, dir)
      .then((vs) => {
        if (cancelled) return
        setLoadError(null)
        setVersions(vs)
        const current =
          vs.find((v) => `${v.id}@${v.version}` === workerRef) ??
          vs[vs.length - 1]
        if (current) loadDraft(current)
      })
      .catch(
        (e) =>
          !cancelled &&
          setLoadError(e instanceof Error ? e.message : String(e)),
      )
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

  // nextVersionAfter mirrors core/server.nextPatchVersion — a preview only;
  // the server computes the authoritative version at save time.
  function nextVersionAfter(vs: Worker[] | null): string {
    if (!vs || vs.length === 0) return '1.0.0'
    const parts = vs[vs.length - 1].version.split('.')
    if (parts.length !== 3) return '1.0.0'
    const [major, minor, patch] = parts.map(Number)
    if ([major, minor, patch].some(Number.isNaN)) return '1.0.0'
    return `${major}.${minor}.${patch + 1}`
  }

  function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max - 1)}…` : text
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
      const saved = await saveWorker(
        serverUrl,
        { ...draft, contract: { ...draft.contract, outputSchema: schema } },
        dir,
      )
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
              {v.version} — {truncate(v.objective, 40)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? 'saving…' : 'save as new version'}
        </button>
        {savedNotice && (
          <span className="text-xs text-emerald-700">{savedNotice}</span>
        )}
      </div>
      <p className="text-[11px] text-neutral-400">
        Save always creates{' '}
        <span className="font-mono">
          {id}@{nextVersionAfter(versions)}
        </span>{' '}
        — nothing already registered changes. Pick an older version above to
        review it or roll back to it (re-points this node, destroys nothing).
      </p>
      {saveError && <p className="text-xs text-red-600">{saveError}</p>}

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Objective
        </span>
        <textarea
          value={draft.objective}
          onChange={(e) => setDraft({ ...draft, objective: e.target.value })}
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Constraints (one per line)
        </span>
        <textarea
          value={draft.constraints.join('\n')}
          onChange={(e) =>
            setDraft({ ...draft, constraints: linesOf(e.target.value) })
          }
          rows={3}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Tools (one per line)
        </span>
        <textarea
          value={draft.tools.join('\n')}
          onChange={(e) =>
            setDraft({ ...draft, tools: linesOf(e.target.value) })
          }
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Contract goal
        </span>
        <input
          type="text"
          value={draft.contract.goal}
          onChange={(e) =>
            setDraft({
              ...draft,
              contract: { ...draft.contract, goal: e.target.value },
            })
          }
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Rules (one per line)
        </span>
        <textarea
          value={draft.contract.rules.join('\n')}
          onChange={(e) =>
            setDraft({
              ...draft,
              contract: { ...draft.contract, rules: linesOf(e.target.value) },
            })
          }
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Success criteria (one per line)
        </span>
        <textarea
          value={draft.contract.successCriteria.join('\n')}
          onChange={(e) =>
            setDraft({
              ...draft,
              contract: {
                ...draft.contract,
                successCriteria: linesOf(e.target.value),
              },
            })
          }
          rows={2}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
        />
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Max retries
        </span>
        <input
          type="number"
          min={0}
          value={draft.contract.maxRetries}
          onChange={(e) =>
            setDraft({
              ...draft,
              contract: {
                ...draft.contract,
                maxRetries: Number(e.target.value),
              },
            })
          }
          className="mt-0.5 w-20 rounded border border-neutral-300 px-1.5 py-1 text-xs"
        />
      </label>

      <div className="flex items-end gap-1.5">
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            Model provider
          </span>
          <select
            value={draft.model.provider}
            onChange={(e) =>
              setDraft({
                ...draft,
                model: { ...draft.model, provider: e.target.value },
              })
            }
            className="mt-0.5 rounded border border-neutral-300 px-1.5 py-1 text-xs"
          >
            <option value="openai">openai</option>
            <option value="anthropic">anthropic</option>
          </select>
        </label>
        <label className="block flex-1">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            Model
          </span>
          <input
            type="text"
            value={draft.model.model}
            onChange={(e) =>
              setDraft({
                ...draft,
                model: { ...draft.model, model: e.target.value },
              })
            }
            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
          />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            Temperature
          </span>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={
              typeof draft.model.params?.temperature === 'number'
                ? draft.model.params.temperature
                : ''
            }
            onChange={(e) => {
              const raw = e.target.value
              const params: Record<string, unknown> = { ...draft.model.params }
              if (raw === '') delete params.temperature
              else params.temperature = Number(raw)
              setDraft({ ...draft, model: { ...draft.model, params } })
            }}
            className="mt-0.5 w-16 rounded border border-neutral-300 px-1.5 py-1 text-xs"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Output schema (JSON)
        </span>
        <textarea
          value={schemaText}
          onChange={(e) => setSchemaText(e.target.value)}
          rows={6}
          className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-[11px]"
        />
        {schemaError && (
          <p className="mt-0.5 text-xs text-red-600">{schemaError}</p>
        )}
      </label>

      {envelopeErrors.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
          <p className="font-medium">
            {envelopeErrors.length} validation issue
            {envelopeErrors.length === 1 ? '' : 's'} — save is still allowed;
            the server re-checks and will reject an actually invalid Worker.
          </p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
            {envelopeErrors.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

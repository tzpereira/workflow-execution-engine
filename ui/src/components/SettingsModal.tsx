import { useEffect, useState } from 'react'

import type { Connection, Settings } from '../core/audit'
import {
  fetchSecretsStatus,
  fetchSettings,
  saveSettings,
  setSecret,
  unsetSecret,
} from '../liveClient'
import { useLive } from '../liveStore'

const CONNECTION_PRESETS = [
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'model-provider',
    type: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    secretEnv: 'OPENAI_API_KEY',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    kind: 'model-provider',
    type: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    secretEnv: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'kimi',
    label: 'Kimi / Moonshot',
    kind: 'model-provider',
    type: 'openai-compatible',
    baseUrl: 'https://api.moonshot.ai/v1',
    secretEnv: 'MOONSHOT_API_KEY',
  },
  {
    id: 'github',
    label: 'GitHub',
    kind: 'change-source',
    type: 'github',
    baseUrl: 'https://api.github.com',
    secretEnv: 'GITHUB_AUTH_HEADER',
    defaults: { tokenHeader: 'Authorization: Bearer <token>' },
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    kind: 'change-source',
    type: 'gitlab',
    baseUrl: 'https://gitlab.com/api/v4',
    secretEnv: 'GITLAB_AUTH_HEADER',
    defaults: { tokenHeader: 'PRIVATE-TOKEN: <token>' },
  },
  {
    id: 'bitbucket',
    label: 'Bitbucket',
    kind: 'change-source',
    type: 'bitbucket',
    baseUrl: 'https://api.bitbucket.org/2.0',
    secretEnv: 'BITBUCKET_AUTH_HEADER',
    defaults: { tokenHeader: 'Authorization: Bearer <token>' },
  },
  {
    id: 'local-repository',
    label: 'Local repository',
    kind: 'change-source',
    type: 'local-repository',
  },
  {
    id: 'public-patch',
    label: 'Public patch URL',
    kind: 'change-source',
    type: 'patch-url',
  },
] satisfies Connection[]

// SettingsModal is the M2.9 Connections surface. Secret values are write-only:
// GET /api/secrets reports only presence for the env-var names referenced by
// configured Connections, never values. Durable settings persist only
// non-secret fields and env-var names.
export function SettingsModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const serverUrl = useLive((s) => s.serverUrl)
  const [status, setStatus] = useState<Record<string, boolean>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldFeedback, setFieldFeedback] = useState<Record<string, string>>({})
  // Durable, non-secret settings (persisted to settings.json, REQ-CTRL-05) —
  // distinct from the in-memory secrets above.
  const [settings, setSettings] = useState<Settings>({})
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsFeedback, setSettingsFeedback] = useState<string | null>(null)
  const [connectionPreset, setConnectionPreset] = useState(CONNECTION_PRESETS[0].id)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void Promise.resolve()
      .then(() => {
        if (!cancelled) {
          setLoading(true)
          setError(null)
        }
      })
      .then(() =>
        fetchSecretsStatus(
          serverUrl,
          secretNames(settings),
        ),
      )
      .then((nextStatus) => {
        if (!cancelled) setStatus(nextStatus)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, serverUrl, settings])

  // Load the durable settings when the modal opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetchSettings(serverUrl)
      .then((s) => {
        if (!cancelled) setSettings(s)
      })
      .catch(() => {
        // Non-fatal: an unreachable server already surfaces via the secrets
        // load above; the durable section just stays at its defaults.
      })
    return () => {
      cancelled = true
    }
  }, [open, serverUrl])

  async function saveDurable() {
    setSettingsBusy(true)
    setSettingsFeedback('Saving settings…')
    setError(null)
    try {
      const saved = await saveSettings(serverUrl, settings)
      setSettings(saved)
      setSettingsFeedback('Settings saved.')
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setSettingsFeedback(`Save failed: ${message}`)
      setError(message)
    } finally {
      setSettingsBusy(false)
    }
  }

  function patchConnection(id: string, patch: Partial<Connection>) {
    setSettingsFeedback('Unsaved changes.')
    setSettings((s) => ({
      ...s,
      connections: (s.connections ?? []).map((c) =>
        c.id === id ? { ...c, ...patch } : c,
      ),
    }))
  }

  function addConnection() {
    const preset = CONNECTION_PRESETS.find((p) => p.id === connectionPreset)
    if (!preset) return
    setSettingsFeedback('Unsaved changes.')
    setSettings((s) => {
      const existing = s.connections ?? []
      if (existing.some((c) => c.id === preset.id)) return s
      return { ...s, connections: [...existing, { ...preset }] }
    })
  }

  function removeConnection(id: string) {
    setSettingsFeedback('Unsaved changes.')
    setSettings((s) => ({
      ...s,
      connections: (s.connections ?? []).filter((c) => c.id !== id),
    }))
  }

  if (!open) return null

  function close() {
    setError(null)
    onOpenChange(false)
  }

  async function save(name: string) {
    const value = normalizeSecretValue(name, drafts[name] ?? '')
    if (!value) return
    setBusy(name)
    setFieldFeedback((f) => ({ ...f, [name]: 'Saving…' }))
    setError(null)
    try {
      await setSecret(serverUrl, name, value)
      setStatus((s) => ({ ...s, [name]: true }))
      setDrafts((d) => ({ ...d, [name]: '' }))
      setFieldFeedback((f) => ({ ...f, [name]: 'Saved.' }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setFieldFeedback((f) => ({ ...f, [name]: `Save failed: ${message}` }))
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  async function clear(name: string) {
    setDrafts((d) => ({ ...d, [name]: '' }))
    if (!status[name]) {
      setFieldFeedback((f) => ({ ...f, [name]: 'Draft cleared.' }))
      return
    }
    setBusy(name)
    setFieldFeedback((f) => ({ ...f, [name]: 'Clearing…' }))
    setError(null)
    try {
      await unsetSecret(serverUrl, name)
      setStatus((s) => ({ ...s, [name]: false }))
      setFieldFeedback((f) => ({ ...f, [name]: 'Cleared.' }))
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setFieldFeedback((f) => ({ ...f, [name]: `Clear failed: ${message}` }))
      setError(message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24"
      onClick={close}
    >
      <div
        className="w-[42rem] max-w-[94vw] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
          <span className="text-sm font-semibold text-neutral-900">
            Settings
          </span>
          <button type="button" className="btn" onClick={close}>
            close
          </button>
        </div>
        <div className="max-h-[70vh] space-y-4 overflow-auto p-3">
          {loading && (
            <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs text-neutral-500">
              Loading runtime settings from {serverUrl}
            </div>
          )}
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              <div className="font-medium">Settings unavailable</div>
              <div>{error}</div>
            </div>
          )}
          <div className="space-y-4">
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-semibold text-neutral-900">
                    Connections
                  </div>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Named provider and source references. Values stay write-only.
                  </p>
                </div>
                <div className="flex gap-1.5">
                  <select
                    value={connectionPreset}
                    onChange={(e) => setConnectionPreset(e.target.value)}
                    className="rounded border border-neutral-300 px-1.5 py-1 text-xs"
                    aria-label="Connection preset"
                  >
                    {CONNECTION_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn" onClick={addConnection}>
                    Add connection
                  </button>
                </div>
              </div>
              {(settings.connections ?? []).length === 0 && (
                <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-2 text-xs text-neutral-500">
                  No connections configured yet.
                </div>
              )}
              {(settings.connections ?? []).map((c) => (
                <div
                  key={c.id}
                  className="rounded border border-neutral-200 bg-white p-2"
                >
                  <div className="flex items-center gap-1.5">
                    <input
                      aria-label={`${c.id} label`}
                      value={c.label}
                      onChange={(e) =>
                        patchConnection(c.id, { label: e.target.value })
                      }
                      className="min-w-0 flex-1 rounded border border-neutral-300 px-1.5 py-1 text-xs font-medium"
                    />
                    <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                      {c.kind}
                    </span>
                    {c.secretEnv && (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] ${
                          status[c.secretEnv]
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-neutral-100 text-neutral-500'
                        }`}
                      >
                        {status[c.secretEnv] ? 'set' : 'unset'}
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn"
                      onClick={() => removeConnection(c.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                    <input
                      aria-label={`${c.id} id`}
                      value={c.id}
                      onChange={(e) => patchConnection(c.id, { id: e.target.value })}
                      className="rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
                    />
                    <input
                      aria-label={`${c.id} base URL`}
                      value={c.baseUrl ?? ''}
                      onChange={(e) =>
                        patchConnection(c.id, {
                          baseUrl: e.target.value || undefined,
                        })
                      }
                      placeholder="base URL"
                      className="rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs sm:col-span-2"
                    />
                  </div>
                  {c.secretEnv && (
                    <div className="mt-1.5">
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          aria-label={`${c.label} secret`}
                          value={drafts[c.secretEnv] ?? ''}
                          onChange={(e) =>
                            setDrafts((d) => ({
                              ...d,
                              [c.secretEnv ?? '']: e.target.value,
                            }))
                          }
                          placeholder={
                            status[c.secretEnv]
                              ? 'set - enter a new value to update'
                              : c.secretEnv
                          }
                          className="min-w-0 flex-1 rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
                        />
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={
                            busy === c.secretEnv ||
                            !(drafts[c.secretEnv] ?? '').trim()
                          }
                          onClick={() => void save(c.secretEnv ?? '')}
                        >
                          {busy === c.secretEnv
                            ? 'Saving'
                            : status[c.secretEnv]
                              ? 'Update'
                              : 'Save'}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          disabled={
                            busy === c.secretEnv ||
                            (!status[c.secretEnv] && !drafts[c.secretEnv])
                          }
                          onClick={() => void clear(c.secretEnv ?? '')}
                        >
                          Clear
                        </button>
                      </div>
                      {fieldFeedback[c.secretEnv] && (
                        <div
                          className={`mt-1 text-[11px] ${
                            fieldFeedback[c.secretEnv].includes('failed')
                              ? 'text-red-700'
                              : 'text-neutral-500'
                          }`}
                          role="status"
                        >
                          {fieldFeedback[c.secretEnv]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="border-t border-neutral-200 pt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-900">
                Runtime defaults
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-500">
                saved to disk
              </span>
            </div>
            <p className="mb-2 text-xs text-neutral-500">
              Persisted in the workspace and applied to runs — they survive a{' '}
              <code>wee serve</code> restart. No secret values are ever stored
              here.
            </p>
            <div className="space-y-2">
              <label className="block">
                <span className="text-[11px] font-medium text-neutral-700">
                  Workspace root
                </span>
                <input
                  type="text"
                  value={settings.workspaceRoot ?? ''}
                  onChange={(e) => {
                    setSettingsFeedback('Unsaved changes.')
                    setSettings((s) => ({
                      ...s,
                      workspaceRoot: e.target.value || undefined,
                    }))
                  }}
                  placeholder="/path/to/local/repo-checkout"
                  className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
                />
              </label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <span className="text-[11px] font-medium text-neutral-700">
                    Default budget (USD)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={settings.defaultBudgetUsd ?? ''}
                    onChange={(e) => {
                      setSettingsFeedback('Unsaved changes.')
                      setSettings((s) => ({
                        ...s,
                        defaultBudgetUsd:
                          e.target.value === ''
                            ? undefined
                            : Number(e.target.value),
                      }))
                    }}
                    placeholder="0 = use each workflow's own"
                    className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
                  />
                </label>
                <label className="flex-1">
                  <span className="text-[11px] font-medium text-neutral-700">
                    Cache mode
                  </span>
                  <select
                    value={settings.cacheMode ?? ''}
                    onChange={(e) => {
                      setSettingsFeedback('Unsaved changes.')
                      setSettings((s) => ({
                        ...s,
                        cacheMode: e.target.value || undefined,
                      }))
                    }}
                    className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
                    aria-label="Cache mode"
                  >
                    <option value="">default (on)</option>
                    <option value="on">on</option>
                    <option value="readonly">readonly</option>
                    <option value="off">off</option>
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={settingsBusy}
                  onClick={() => void saveDurable()}
                >
                  {settingsBusy ? 'Saving settings' : 'Save settings'}
                </button>
                {settingsFeedback && (
                  <span
                    className={`text-[11px] ${
                      settingsFeedback.includes('failed')
                        ? 'text-red-700'
                        : settingsFeedback.includes('Unsaved')
                          ? 'text-amber-700'
                          : 'text-emerald-600'
                    }`}
                    role="status"
                  >
                    {settingsFeedback}
                  </span>
                )}
              </div>
            </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function normalizeGitHubAuthHeader(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^(bearer|token)\s+/i.test(trimmed)) return trimmed
  return `Bearer ${trimmed}`
}

function normalizeSecretValue(name: string, value: string) {
  if (name === 'GITHUB_AUTH_HEADER') return normalizeGitHubAuthHeader(value)
  return value.trim()
}

function secretNames(settings: Settings) {
  return Array.from(
    new Set([
      ...(settings.connections ?? [])
        .map((c) => c.secretEnv)
        .filter((v): v is string => Boolean(v)),
    ]),
  )
}

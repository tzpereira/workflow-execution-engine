import { useEffect, useState } from 'react'

import type { Settings } from '../core/audit'
import {
  fetchSecretsStatus,
  fetchSettings,
  saveSettings,
  setSecret,
  unsetSecret,
} from '../liveClient'
import { useLive } from '../liveStore'

// The settings this project ships examples for. API keys are secrets; the
// workspace root is plain runtime config, but uses the same in-memory endpoint
// so a run can pick it up without restarting `wee serve`.
const FIELDS = [
  {
    name: 'OPENAI_API_KEY',
    label: 'OpenAI API key',
    placeholder: 'sk-...',
    secret: true,
  },
  {
    name: 'ANTHROPIC_API_KEY',
    label: 'Anthropic API key',
    placeholder: 'sk-ant-...',
    secret: true,
  },
  {
    name: 'GITHUB_AUTH_HEADER',
    label: 'GitHub token',
    placeholder: 'ghp_... or github_pat_...',
    secret: true,
    normalize: normalizeGitHubAuthHeader,
  },
  {
    name: 'WEE_WORKSPACE_ROOT',
    label: 'Workspace root',
    placeholder: '/path/to/local/repo-checkout',
    secret: false,
  },
] as const

// SettingsModal (M1.14e) is where API keys and the GitHub token get set
// without hand-editing .env or restarting `wee serve` — the missing piece
// that made "start the server, edit .env, restart the server" the only way
// to change any of this. Every field is write-only: GET /api/secrets reports
// only whether a name is set, never its value, and nothing here is ever
// persisted to disk or recorded in a run's audit trail (owner-confirmed
// 2026-07-20) — a server restart clears all of it, by design.
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
          FIELDS.map((f) => f.name),
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
  }, [open, serverUrl])

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

  function patchBaseUrl(provider: string, url: string) {
    setSettingsFeedback('Unsaved changes.')
    setSettings((s) => ({
      ...s,
      providerBaseUrls: { ...s.providerBaseUrls, [provider]: url },
    }))
  }

  if (!open) return null

  function close() {
    setError(null)
    onOpenChange(false)
  }

  async function save(name: string) {
    const field = FIELDS.find((f) => f.name === name)
    const value =
      field && 'normalize' in field
        ? field.normalize(drafts[name] ?? '')
        : (drafts[name] ?? '').trim()
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
          <div className="space-y-2">
            <div>
              <div className="text-xs font-semibold text-neutral-900">
                Runtime envs
              </div>
              <p className="mt-0.5 text-xs text-neutral-500">
                Applied to this running server process only. Restarting{' '}
                <code>wee serve</code> clears these values.
              </p>
            </div>
            {FIELDS.map((f) => (
              <div
                key={f.name}
                className="rounded border border-neutral-200 bg-neutral-50 p-2"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${status[f.name] ? 'bg-emerald-500' : 'bg-neutral-300'}`}
                    aria-hidden="true"
                  />
                  <label
                    className="text-xs font-medium text-neutral-700"
                    htmlFor={`secret-${f.name}`}
                  >
                    {f.label}
                  </label>
                  <span className="font-mono text-[10px] text-neutral-400">
                    {f.name}
                  </span>
                  <span
                    className={`ml-auto rounded px-1.5 py-0.5 text-[10px] ${
                      status[f.name]
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-neutral-100 text-neutral-500'
                    }`}
                  >
                    {status[f.name] ? 'set' : 'missing'}
                  </span>
                </div>
                <div className="mt-1.5 flex gap-1.5">
                  <input
                    id={`secret-${f.name}`}
                    type={f.secret ? 'password' : 'text'}
                    value={drafts[f.name] ?? ''}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [f.name]: e.target.value }))
                    }
                    placeholder={
                      status[f.name]
                        ? 'set - enter a new value to replace'
                        : f.placeholder
                    }
                    className="min-w-0 flex-1 rounded border border-neutral-300 bg-white px-1.5 py-1 font-mono text-xs"
                  />
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy === f.name || !(drafts[f.name] ?? '').trim()}
                    onClick={() => void save(f.name)}
                  >
                    {busy === f.name
                      ? 'Saving'
                      : status[f.name]
                        ? 'Replace'
                        : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="btn"
                    disabled={
                      busy === f.name || (!status[f.name] && !drafts[f.name])
                    }
                    onClick={() => void clear(f.name)}
                  >
                    Clear
                  </button>
                </div>
                {fieldFeedback[f.name] && (
                  <div
                    className={`mt-1 text-[11px] ${
                      fieldFeedback[f.name].includes('failed')
                        ? 'text-red-700'
                        : 'text-neutral-500'
                    }`}
                    role="status"
                  >
                    {fieldFeedback[f.name]}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-200 pt-3">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-900">
                Durable settings
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
                  OpenAI base URL
                </span>
                <input
                  type="text"
                  value={settings.providerBaseUrls?.openai ?? ''}
                  onChange={(e) => patchBaseUrl('openai', e.target.value)}
                  placeholder="https://api.openai.com/v1 (or a self-hosted endpoint)"
                  className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-neutral-700">
                  Anthropic base URL
                </span>
                <input
                  type="text"
                  value={settings.providerBaseUrls?.anthropic ?? ''}
                  onChange={(e) => patchBaseUrl('anthropic', e.target.value)}
                  placeholder="https://api.anthropic.com/v1"
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
  )
}

function normalizeGitHubAuthHeader(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^(bearer|token)\s+/i.test(trimmed)) return trimmed
  return `Bearer ${trimmed}`
}

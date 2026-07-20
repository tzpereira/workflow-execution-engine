import { useEffect, useState } from 'react'

import { fetchSecretsStatus, setSecret, unsetSecret } from '../liveClient'
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
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    fetchSecretsStatus(
      serverUrl,
      FIELDS.map((f) => f.name),
    )
      .then(setStatus)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [open, serverUrl])

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
        : drafts[name]
    if (!value) return
    setBusy(name)
    setError(null)
    try {
      await setSecret(serverUrl, name, value)
      setStatus((s) => ({ ...s, [name]: true }))
      setDrafts((d) => ({ ...d, [name]: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  async function clear(name: string) {
    setBusy(name)
    setError(null)
    try {
      await unsetSecret(serverUrl, name)
      setStatus((s) => ({ ...s, [name]: false }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
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
        className="w-[28rem] max-w-[90vw] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
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
        <div className="max-h-96 space-y-3 overflow-auto p-3">
          <p className="text-xs text-neutral-500">
            Held only in this server's memory for the current session — never
            written to disk, never recorded in any run's audit trail. Restarting{' '}
            <code>wee serve</code> clears everything set here.
          </p>
          {error && <p className="text-xs text-red-600">{error}</p>}
          {FIELDS.map((f) => (
            <div key={f.name}>
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
              </div>
              <div className="mt-1 flex gap-1.5">
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
                  className="flex-1 rounded border border-neutral-300 px-1.5 py-1 font-mono text-xs"
                />
                <button
                  type="button"
                  className="btn"
                  disabled={busy === f.name || !drafts[f.name]}
                  onClick={() => void save(f.name)}
                >
                  {busy === f.name ? 'saving' : 'save'}
                </button>
                {status[f.name] && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy === f.name}
                    onClick={() => void clear(f.name)}
                  >
                    clear
                  </button>
                )}
              </div>
            </div>
          ))}
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

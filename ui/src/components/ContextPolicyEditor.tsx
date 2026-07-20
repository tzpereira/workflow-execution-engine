import type { ContextPolicy } from '../core/model'

// ContextPolicyEditor is M1.14c's Context Policy half: mode + (for "artifacts"
// mode) which upstream nodes to admit, edited directly on the node — no
// server round-trip, since a node's contextPolicy already lives in
// useWorkspace's canvas state (unlike a Worker's body, which is a separate
// versioned file). "summary" is omitted from the picker: Resolve refuses it
// today (concepts/context-policy.md) — no point offering an option
// guaranteed to fail every run.
//
// A node's own contextPolicy is an *override* — core/engine/worker_executor.go
// falls back to the Worker's own contextPolicy when a node doesn't set one
// (`node.ContextPolicy != nil` gates the override). Silently defaulting the
// mode select to "parent-only" when there's no override would misrepresent
// what's actually in effect if the Worker's own default is something else —
// so "no override" is its own explicit state here, showing the Worker's
// default as read-only info until the user opts into overriding it.
export function ContextPolicyEditor({
  policy,
  workerDefault,
  availableNodeIds,
  onChange,
}: {
  policy: ContextPolicy | undefined
  workerDefault: ContextPolicy | undefined
  availableNodeIds: string[]
  onChange: (policy: ContextPolicy | undefined) => void
}) {
  if (!policy) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-neutral-500">
          using the Worker's own default: <span className="font-mono text-neutral-700">{workerDefault?.mode ?? '—'}</span>
        </p>
        <button type="button" className="btn" onClick={() => onChange(workerDefault ?? { mode: 'parent-only' })}>
          override for this node
        </button>
      </div>
    )
  }

  const selectedArtifacts = policy.params?.artifacts ?? []

  function setMode(next: string) {
    onChange(next === 'artifacts' ? { mode: next, params: { artifacts: selectedArtifacts } } : { mode: next })
  }

  function toggleArtifact(nodeId: string) {
    const next = selectedArtifacts.includes(nodeId)
      ? selectedArtifacts.filter((n) => n !== nodeId)
      : [...selectedArtifacts, nodeId]
    onChange({ mode: 'artifacts', params: { artifacts: next } })
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <select
          value={policy.mode}
          onChange={(e) => setMode(e.target.value)}
          className="flex-1 rounded border border-neutral-300 px-1.5 py-1 text-xs"
          aria-label="Context policy mode"
        >
          {MODES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button type="button" className="btn" onClick={() => onChange(undefined)} title="Remove this node's override">
          clear
        </button>
      </div>
      {policy.mode === 'artifacts' && (
        <div className="space-y-0.5 rounded border border-neutral-200 p-1.5">
          {availableNodeIds.length === 0 && <p className="text-[11px] text-neutral-400">no other nodes yet</p>}
          {availableNodeIds.map((nodeId) => (
            <label key={nodeId} className="flex items-center gap-1.5 text-xs text-neutral-700">
              <input type="checkbox" checked={selectedArtifacts.includes(nodeId)} onChange={() => toggleArtifact(nodeId)} />
              <span className="font-mono">{nodeId}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

const MODES = ['parent-only', 'full', 'diff-only', 'artifacts', 'none'] as const

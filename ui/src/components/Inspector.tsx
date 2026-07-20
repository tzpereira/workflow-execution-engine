import { useState } from 'react'

import type { Audit } from '../core/audit'
import { contextHashesFor, nodeIdForHash } from '../core/audit'
import type { LiveState } from '../core/live'
import { nodeKind, type ContextPolicy, type Node as WFNode } from '../core/model'
import { useLive } from '../liveStore'
import { budget as budgetSchema } from '../schemas'
import { useWorkspace } from '../store'
import { ArtifactViewer } from './ArtifactViewer'
import { ContextPolicyEditor } from './ContextPolicyEditor'
import { EventList } from './EventList'
import { SchemaForm } from './SchemaForm'
import { WorkerEditor } from './WorkerEditor'

/** dirOf returns the directory portion of a workspace fileName ("" for a
 *  bare basename — a plain browser-imported file always resolves against the
 *  server's own --dir root; a template import nests under <dir>/<name>/,
 *  M1.14's handleImportTemplate). Mirrors the server's own filepath.Join(dir,
 *  "") no-op for the root case. */
function dirOf(fileName: string | null): string {
  if (!fileName) return ''
  const i = fileName.lastIndexOf('/')
  return i === -1 ? '' : fileName.slice(0, i)
}

// Inspector is the right pane: the selected node's full picture — Goal,
// Contract, validation result, resolved context, artifact, cost/tokens/
// duration, and its own event history (REQ-UI-03) — or the workflow's own
// metadata and Budget form when nothing is selected. Everything here is a
// panel, never a modal (M1.13's one hard rule).
export function Inspector({ width = 320 }: { width?: number }) {
  const selectedId = useWorkspace((s) => s.selectedNodeId)
  const nodes = useWorkspace((s) => s.nodes)
  const fileName = useWorkspace((s) => s.fileName)
  const updateNodeBody = useWorkspace((s) => s.updateNodeBody)
  const meta = useWorkspace((s) => s.meta)
  const setMeta = useWorkspace((s) => s.setMeta)
  const live = useLive((s) => s.live)
  const audit = useLive((s) => s.audit)
  const serverUrl = useLive((s) => s.serverUrl)

  const selected = nodes.find((n) => n.id === selectedId)?.data.node
  const otherNodeIds = nodes.map((n) => n.id).filter((id) => id !== selectedId)

  return (
    <aside className="flex h-full shrink-0 flex-col border-l border-neutral-200 bg-white" style={{ width }}>
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {selected ? 'Node' : 'Workflow'}
      </div>
      <div className="flex-1 overflow-auto p-3 text-sm">
        {selected ? (
          <NodeInspector
            key={selected.id}
            node={selected}
            live={live}
            audit={audit}
            dir={dirOf(fileName)}
            serverUrl={serverUrl}
            otherNodeIds={otherNodeIds}
            onNodeChange={(next) => updateNodeBody(selected.id, next)}
          />
        ) : (
          <div className="space-y-3">
            <dl className="space-y-2">
              <Field label="id" value={meta.id} />
              <Field label="version" value={meta.version} />
            </dl>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">Budget</div>
              {/* Generated from schemas/budget.schema.json — the exact file the
                  engine validates against, never hand-copied fields. */}
              <SchemaForm schema={budgetSchema} formData={meta.budget} onChange={(b) => setMeta({ ...meta, budget: b })} />
            </div>
            {audit?.inputs && Object.keys(audit.inputs).length > 0 && (
              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Inputs (this run)
                </div>
                <dl className="space-y-1">
                  {Object.entries(audit.inputs).map(([name, value]) => (
                    <div key={name} className="flex items-baseline gap-1.5 font-mono text-xs">
                      <dt className="text-neutral-500">{name}</dt>
                      <dd className="truncate text-neutral-800" title={value}>
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}

function NodeInspector({
  node,
  live,
  audit,
  dir,
  serverUrl,
  otherNodeIds,
  onNodeChange,
}: {
  node: WFNode
  live: LiveState
  audit: Audit | null
  dir: string
  serverUrl: string
  otherNodeIds: string[]
  onNodeChange: (next: WFNode) => void
}) {
  const kind = nodeKind(node)
  const liveNode = live.nodes[node.id]
  const record = audit?.nodes[node.id]
  const [workerDefaultPolicy, setWorkerDefaultPolicy] = useState<ContextPolicy | undefined>(undefined)

  // Prefer the audit's recorded events (available as soon as the snapshot is
  // fetched, incl. for a run started before this page loaded); fall back to
  // the live stream's own event buffer so a just-connected watch still shows
  // something before the first audit fetch resolves.
  const nodeEvents = (audit?.events ?? live.events).filter((e) => e.nodeId === node.id)
  const violations = nodeEvents.filter((e) => e.type === 'ContractViolation').length
  const ran = liveNode?.status === 'succeeded' || liveNode?.status === 'cached'
  const contextHashes = audit ? contextHashesFor(audit, node.id) : []

  // Static once the node ends — a live-ticking clock belongs to the Timeline's
  // Gantt bars (which already own a `now` tick), not this summary; computing
  // Date.now() directly in render would make the component impure.
  const duration =
    liveNode?.startedAt != null && liveNode.endedAt != null
      ? `${((liveNode.endedAt - liveNode.startedAt) / 1000).toFixed(1)}s`
      : liveNode?.startedAt != null
        ? 'running…'
        : '—'

  return (
    <div className="space-y-3">
      <dl className="space-y-2">
        <Field label="id" value={node.id} />
        <Field label="kind" value={kind} />
        <Field label={kind === 'tool' ? 'tool' : 'worker'} value={kind === 'tool' ? (node.tool?.toolName ?? '—') : (node.worker ?? '—')} />
      </dl>

      {kind === 'worker' && node.worker && (
        <Section title="Worker & Contract">
          <WorkerEditor
            workerRef={node.worker}
            dir={dir}
            serverUrl={serverUrl}
            onWorkerRefChange={(newRef) => onNodeChange({ ...node, worker: newRef })}
            onWorkerLoaded={(w) => setWorkerDefaultPolicy(w.contextPolicy)}
          />
        </Section>
      )}

      {kind === 'worker' && (
        <Section title="Context policy">
          <ContextPolicyEditor
            policy={node.contextPolicy}
            workerDefault={workerDefaultPolicy}
            availableNodeIds={otherNodeIds}
            onChange={(policy) => {
              const next = { ...node }
              if (policy) next.contextPolicy = policy
              else delete next.contextPolicy
              onNodeChange(next)
            }}
          />
        </Section>
      )}

      {kind === 'tool' && (
        <Section title="Tool input">
          <pre className="overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
            {JSON.stringify(node.tool?.input ?? {}, null, 2)}
          </pre>
        </Section>
      )}

      {/* What this node actually produced — the single most commonly needed
          answer when inspecting a node — comes right after Goal, ahead of
          the Contract's full schema dump (reference material, checked far
          less often). Previously Artifact sat below Contract/Validation/
          Resolved context/Cost, forcing a scroll past a JSON schema dump to
          see a node's own output. */}
      <Section title="Artifact">
        <ArtifactViewer record={record} />
      </Section>

      <Section title="Validation">
        {liveNode?.status === 'failed' && liveNode.error ? (
          <p className="text-xs text-red-700">{liveNode.error}</p>
        ) : violations > 0 ? (
          <p className="text-xs text-amber-700">
            {violations} contract violation{violations === 1 ? '' : 's'}, retried
          </p>
        ) : ran ? (
          <p className="text-xs text-emerald-700">valid — no contract violations</p>
        ) : (
          <p className="text-xs text-neutral-400">not run yet</p>
        )}
      </Section>

      <Section title="Cost · tokens · duration">
        <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-xs text-neutral-700">
          <span>${(liveNode?.costUsd ?? record?.costUsd ?? 0).toFixed(4)}</span>
          <span>{liveNode?.tokens ?? record?.tokens ?? 0} tok</span>
          <span>{duration}</span>
          {!!liveNode?.retries && (
            <span className="text-amber-700">
              {liveNode.retries} retr{liveNode.retries === 1 ? 'y' : 'ies'}
            </span>
          )}
        </div>
      </Section>

      <Section title="Resolved context">
        {contextHashes.length > 0 ? (
          <ul className="space-y-0.5 font-mono text-xs text-neutral-700">
            {contextHashes.map((h) => {
              const fromNode = audit ? nodeIdForHash(audit, h) : undefined
              return <li key={h}>{fromNode ?? `${h.slice(0, 12)}…`}</li>
            })}
          </ul>
        ) : (
          <p className="text-xs text-neutral-400">{ran ? 'none admitted' : 'not resolved yet'}</p>
        )}
      </Section>

      <Section title="Events">
        <EventList events={nodeEvents} fixedNodeId={node.id} />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</div>
      {children}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-mono text-neutral-900">{value}</dd>
    </div>
  )
}

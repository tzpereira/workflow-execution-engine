import type { ReactNode } from 'react'
import { useState } from 'react'

import type { Audit } from '../core/audit'
import {
  contextHashesFor,
  nodeIdForHash,
  resolvedModelIdentity,
  resolvedToolVersion,
} from '../core/audit'
import type { WorkflowMeta } from '../core/graph'
import type { LiveState } from '../core/live'
import { signal } from '../core/status'
import {
  nodeKind,
  type ContextPolicy,
  type Node as WFNode,
  type Worker,
} from '../core/model'
import { useLive } from '../liveStore'
import { budget as budgetSchema } from '../schemas'
import { useWorkspace } from '../store'
import { ArtifactViewer } from './ArtifactViewer'
import { ContextPolicyEditor } from './ContextPolicyEditor'
import { EventList } from './EventList'
import { SchemaForm } from './SchemaForm'
import { Term } from './Term'
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
export function Inspector({
  width = 320,
  actions,
}: {
  width?: number | string
  actions?: ReactNode
}) {
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
    <aside
      className="flex h-full shrink-0 flex-col border-l border-neutral-200 bg-white"
      style={{ width }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        <span>{selected ? 'Node' : 'Workflow'}</span>
        {actions}
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
          <WorkflowInspector
            meta={meta}
            fileName={fileName}
            nodes={nodes.map((n) => n.data.node)}
            live={live}
            audit={audit}
            serverUrl={serverUrl}
            onMetaChange={setMeta}
          />
        )}
      </div>
    </aside>
  )
}

function WorkflowInspector({
  meta,
  fileName,
  nodes,
  live,
  audit,
  serverUrl,
  onMetaChange,
}: {
  meta: WorkflowMeta
  fileName: string | null
  nodes: WFNode[]
  live: LiveState
  audit: Audit | null
  serverUrl: string
  onMetaChange: (meta: WorkflowMeta) => void
}) {
  const completed = Object.values(live.nodes).filter(
    (n) => n.status === 'succeeded' || n.status === 'cached',
  ).length
  const failed = Object.values(live.nodes).filter(
    (n) => n.status === 'failed',
  ).length
  const cached = Object.values(live.nodes).filter(
    (n) => n.status === 'cached',
  ).length

  return (
    <div className="space-y-3">
      <Section title="Run setup">
        <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-2">
          <dl className="grid grid-cols-2 gap-2">
            <Field label="workflow" value={`${meta.id}@${meta.version}`} />
            <Field label="source" value={fileName ?? 'not imported'} />
            <Field label="nodes" value={String(nodes.length)} />
            <Field label="service" value={serverUrl} />
          </dl>
          {nodes.length === 0 && (
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              Import a workflow or choose a template before running.
            </p>
          )}
          {meta.inputs && meta.inputs.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase text-neutral-400">
                Required inputs
              </div>
              <div className="flex flex-wrap gap-1">
                {meta.inputs.map((input) => (
                  <span
                    key={input.name}
                    className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 ring-1 ring-neutral-200"
                  >
                    {input.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Latest execution">
        {live.state === 'idle' && !audit ? (
          <p className="text-xs text-neutral-400">
            Run status, cost, cache, and failures appear here after execution.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2 font-mono text-xs">
            <WorkflowStat
              label="state"
              value={live.state === 'idle' ? 'idle' : `${live.state} run`}
              tone={stateTone(live.state)}
            />
            <WorkflowStat
              label="progress"
              value={`${completed}/${nodes.length}`}
              tone={failed > 0 ? 'text-red-700' : 'text-neutral-900'}
            />
            <WorkflowStat label="cached" value={String(cached)} />
            <WorkflowStat
              label="failed"
              value={String(failed)}
              tone={failed > 0 ? 'text-red-700' : undefined}
            />
            <WorkflowStat
              label="cost"
              value={`$${live.totalCostUsd.toFixed(4)} total`}
            />
            <WorkflowStat label="tokens" value={String(live.totalTokens)} />
          </div>
        )}
      </Section>

      <Section title="Budget">
        <SchemaForm
          schema={budgetSchema}
          formData={meta.budget}
          onChange={(b) => onMetaChange({ ...meta, budget: b })}
        />
      </Section>

      {audit?.inputs && Object.keys(audit.inputs).length > 0 && (
        <Section title="Inputs (this run)">
          <dl className="space-y-1">
            {Object.entries(audit.inputs).map(([name, value]) => (
              <div
                key={name}
                className="flex items-baseline gap-1.5 font-mono text-xs"
              >
                <dt className="text-neutral-500">{name}</dt>
                <dd className="truncate text-neutral-800" title={value}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Collapsible title="Workflow nodes">
        {nodes.length > 0 ? (
          <ul className="space-y-1">
            {nodes.map((node) => (
              <li
                key={node.id}
                className="flex items-center justify-between gap-2 rounded border border-neutral-100 px-2 py-1 text-xs"
              >
                <span className="truncate font-mono text-neutral-800">
                  {node.id}
                </span>
                <span className="shrink-0 text-neutral-500">
                  {nodeKind(node)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-neutral-400">No nodes yet.</p>
        )}
      </Collapsible>
    </div>
  )
}

function stateTone(state: LiveState['state']) {
  return signal(state).textClass
}

function WorkflowStat({
  label,
  value,
  tone = 'text-neutral-900',
}: {
  label: string
  value: string
  tone?: string
}) {
  return (
    <div>
      <div className="text-[10px] uppercase text-neutral-400">{label}</div>
      <div className={tone}>{value}</div>
    </div>
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
  const [workerDefaultPolicy, setWorkerDefaultPolicy] = useState<
    ContextPolicy | undefined
  >(undefined)
  const [authoredWorker, setAuthoredWorker] = useState<Worker | undefined>()

  // Prefer the audit's recorded events (available as soon as the snapshot is
  // fetched, incl. for a run started before this page loaded); fall back to
  // the live stream's own event buffer so a just-connected watch still shows
  // something before the first audit fetch resolves.
  const nodeEvents = (audit?.events ?? live.events).filter(
    (e) => e.nodeId === node.id,
  )
  const violations = nodeEvents.filter(
    (e) => e.type === 'ContractViolation',
  ).length
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
      <Section title="Definition">
        <NodeDefinitionEditor
          node={node}
          kind={kind}
          otherNodeIds={otherNodeIds}
          onNodeChange={onNodeChange}
        />
      </Section>

      <Section title="Execution identity">
        <NodeExecutionIdentity
          node={node}
          audit={audit}
          authoredWorker={authoredWorker}
        />
      </Section>

      {/* Output is the primary inspection task. Definition editing and raw
          execution detail remain available below, collapsed by default. */}
      <Section title="Artifact" term="Artifact">
        <ArtifactViewer record={record} />
      </Section>

      <Section title="Validation">
        {liveNode?.status === 'failed' && liveNode.error ? (
          <p className="text-xs text-red-700">{liveNode.error}</p>
        ) : violations > 0 ? (
          <p className="text-xs text-amber-700">
            {violations} contract violation{violations === 1 ? '' : 's'},
            retried
          </p>
        ) : ran ? (
          <p className="text-xs text-emerald-700">
            valid — no contract violations
          </p>
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

      <Collapsible title="Resolved context">
        {contextHashes.length > 0 ? (
          <ul className="space-y-0.5 font-mono text-xs text-neutral-700">
            {contextHashes.map((h) => {
              const fromNode = audit ? nodeIdForHash(audit, h) : undefined
              return <li key={h}>{fromNode ?? `${h.slice(0, 12)}…`}</li>
            })}
          </ul>
        ) : (
          <p className="text-xs text-neutral-400">
            {ran ? 'none admitted' : 'not resolved yet'}
          </p>
        )}
      </Collapsible>

      {kind === 'worker' && node.worker && (
        <Collapsible title="Worker & Contract" defaultOpen>
          <WorkerEditor
            workerRef={node.worker}
            dir={dir}
            serverUrl={serverUrl}
            onWorkerRefChange={(newRef) =>
              onNodeChange({ ...node, worker: newRef })
            }
            onWorkerLoaded={(w) => {
              setWorkerDefaultPolicy(w.contextPolicy)
              setAuthoredWorker(w)
            }}
          />
        </Collapsible>
      )}

      {kind === 'worker' && (
        <Collapsible title="Context policy">
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
        </Collapsible>
      )}

      {kind === 'tool' && (
        <Collapsible title="Raw tool input">
          <pre className="max-h-64 overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
            {JSON.stringify(node.tool?.input ?? {}, null, 2)}
          </pre>
        </Collapsible>
      )}

      <Collapsible title="Events">
        <EventList events={nodeEvents} fixedNodeId={node.id} />
      </Collapsible>
    </div>
  )
}

function NodeExecutionIdentity({
  node,
  audit,
  authoredWorker,
}: {
  node: WFNode
  audit: Audit | null
  authoredWorker?: Worker
}) {
  const kind = nodeKind(node)
  if (kind === 'tool') {
    const version = audit ? resolvedToolVersion(audit, node.id) : undefined
    return (
      <div className="space-y-2 rounded border border-cyan-200 bg-cyan-50 p-2 text-xs">
        <span className={signal('deterministic').badgeClass}>
          <span aria-hidden="true">{signal('deterministic').icon}</span>
          {signal('deterministic').label}
        </span>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Field label="model" value="no model" />
          <Field label="tool" value={node.tool?.toolName ?? 'unknown'} />
          <Field label="version" value={version ?? 'not resolved yet'} />
          <Field
            label="source"
            value={version ? 'frozen execution event' : 'authored definition'}
          />
        </dl>
      </div>
    )
  }

  if (kind === 'worker') {
    const frozen = audit ? resolvedModelIdentity(audit, node.id) : undefined
    const worker = frozen?.worker ?? authoredWorker
    const provider =
      frozen?.provider ?? worker?.model.provider ?? 'not resolved yet'
    const model = frozen?.model ?? worker?.model.model ?? 'not resolved yet'
    return (
      <div className="space-y-2 rounded border border-violet-200 bg-violet-50 p-2 text-xs">
        <span className={signal('model-backed').badgeClass}>
          <span aria-hidden="true">{signal('model-backed').icon}</span>
          {signal('model-backed').label}
        </span>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
          <Field label="name" value={worker?.id ?? node.worker ?? 'unknown'} />
          <Field label="version" value={worker?.version ?? 'not loaded'} />
          <Field label="provider" value={provider} />
          <Field label="model id" value={model} />
          <Field
            label="source"
            value={frozen ? 'frozen execution snapshot' : 'authored definition'}
          />
          {frozen?.connection && (
            <Field
              label="connection"
              value={`${frozen.connection.label || frozen.connection.id} · ${frozen.connection.type}`}
            />
          )}
        </dl>
        <div>
          <div className="text-[10px] uppercase text-neutral-500">
            description
          </div>
          <p className="text-neutral-800">
            {worker?.description || 'No description provided.'}
          </p>
        </div>
      </div>
    )
  }

  return <p className="text-xs text-red-700">Invalid node definition.</p>
}

function NodeDefinitionEditor({
  node,
  kind,
  otherNodeIds,
  onNodeChange,
}: {
  node: WFNode
  kind: 'worker' | 'tool' | 'invalid'
  otherNodeIds: string[]
  onNodeChange: (next: WFNode) => void
}) {
  const [nodeId, setNodeId] = useState(node.id)
  const [toolInputText, setToolInputText] = useState(
    JSON.stringify(node.tool?.input ?? {}, null, 2),
  )
  const [toolInputError, setToolInputError] = useState<string | null>(null)
  const trimmedId = nodeId.trim()
  const idError =
    trimmedId.length === 0
      ? 'Node id is required.'
      : otherNodeIds.includes(trimmedId)
        ? 'Node id must be unique.'
        : null

  function commitNodeId() {
    if (idError || trimmedId === node.id) return
    onNodeChange({ ...node, id: trimmedId })
  }

  function changeKind(nextKind: 'worker' | 'tool') {
    const base: WFNode = { id: node.id }
    if (node.contextPolicy) base.contextPolicy = node.contextPolicy
    if (node.onFailure) base.onFailure = node.onFailure
    if (nextKind === 'worker') {
      onNodeChange({
        ...base,
        worker: node.worker ?? `${node.id}@1.0.0`,
      })
      return
    }
    onNodeChange({
      ...base,
      tool: node.tool ?? { toolName: 'terminal', input: {} },
    })
  }

  function commitToolInput() {
    if (kind !== 'tool') return
    try {
      const parsed = JSON.parse(toolInputText) as Record<string, unknown>
      if (
        parsed == null ||
        Array.isArray(parsed) ||
        typeof parsed !== 'object'
      ) {
        setToolInputError('Tool input must be a JSON object.')
        return
      }
      setToolInputError(null)
      onNodeChange({
        ...node,
        tool: { toolName: node.tool?.toolName ?? 'terminal', input: parsed },
      })
    } catch {
      setToolInputError('Tool input is not valid JSON.')
    }
  }

  return (
    <div className="space-y-2 rounded border border-neutral-200 bg-neutral-50 p-2">
      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Node id
        </span>
        <input
          type="text"
          value={nodeId}
          onChange={(e) => setNodeId(e.target.value)}
          onBlur={commitNodeId}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
            }
          }}
          className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-1.5 py-1 font-mono text-xs"
        />
        {idError && <p className="mt-0.5 text-xs text-red-600">{idError}</p>}
      </label>

      <label className="block">
        <span className="text-[11px] uppercase tracking-wide text-neutral-500">
          Node type
        </span>
        <select
          value={kind === 'tool' ? 'tool' : 'worker'}
          onChange={(e) => changeKind(e.target.value as 'worker' | 'tool')}
          className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-1.5 py-1 text-xs"
        >
          <option value="worker">worker</option>
          <option value="tool">tool</option>
        </select>
      </label>

      {kind === 'worker' && (
        <label className="block">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            Worker ref
          </span>
          <input
            type="text"
            value={node.worker ?? ''}
            onChange={(e) => onNodeChange({ ...node, worker: e.target.value })}
            className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-1.5 py-1 font-mono text-xs"
          />
        </label>
      )}

      {kind === 'tool' && (
        <>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">
              Tool name
            </span>
            <input
              type="text"
              value={node.tool?.toolName ?? ''}
              onChange={(e) =>
                onNodeChange({
                  ...node,
                  tool: {
                    toolName: e.target.value,
                    input: node.tool?.input ?? {},
                  },
                })
              }
              className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-1.5 py-1 font-mono text-xs"
            />
          </label>
          <label className="block">
            <span className="text-[11px] uppercase tracking-wide text-neutral-500">
              Tool input JSON
            </span>
            <textarea
              value={toolInputText}
              onChange={(e) => setToolInputText(e.target.value)}
              onBlur={commitToolInput}
              rows={5}
              className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-1.5 py-1 font-mono text-[11px]"
            />
            {toolInputError && (
              <p className="mt-0.5 text-xs text-red-600">{toolInputError}</p>
            )}
          </label>
        </>
      )}
    </div>
  )
}

function Section({
  title,
  term,
  children,
}: {
  title: string
  /** When set, wraps the title in a first-encounter, dismissible explanation
   *  of the domain term it names (M1.14d) — omit for a section whose title
   *  isn't project jargon (e.g. "Cost · tokens · duration"). */
  term?: 'Contract' | 'Context policy' | 'Artifact'
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {term ? <Term name={term}>{title}</Term> : title}
      </div>
      {children}
    </div>
  )
}

function Collapsible({
  title,
  defaultOpen = false,
  children,
}: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  return (
    <details className="border-t border-neutral-200 pt-2" open={defaultOpen}>
      <summary className="cursor-pointer select-none text-xs font-semibold uppercase text-neutral-500 hover:text-neutral-800">
        {title}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="truncate font-mono text-neutral-900" title={value}>
        {value}
      </dd>
    </div>
  )
}

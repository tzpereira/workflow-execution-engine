import { Handle, type NodeProps, Position } from '@xyflow/react'

import type { CanvasNode } from '../core/graph'
import { nodeKind } from '../core/model'
import type { NodeStatus } from '../core/live'
import { signal } from '../core/status'
import { useLive } from '../liveStore'
import { NodeArtifactPreview } from './NodeArtifactPreview'

// WorkflowNode renders one graph node. Worker and tool nodes read distinctly (a
// kind badge + the reference), so the graph's two node kinds are legible at a
// glance. Handles on left/right let the user draw dependency edges. While a
// `wee serve` execution is being watched (liveStore), the node's border and a
// small status pill reflect that node's live state — a pure rendering overlay,
// never written back into the canonical graph (graph.ts stays untouched).
export function WorkflowNode({ id, data, selected }: NodeProps<CanvasNode>) {
  const node = data.node
  const kind = nodeKind(node)
  const detail =
    kind === 'tool' ? (node.tool?.toolName ?? '—') : (node.worker ?? '—')

  const live = useLive((s) => s.live)
  const audit = useLive((s) => s.audit)
  const isWatching = live.state !== 'idle'
  const status: NodeStatus = live.nodes[id]?.status ?? 'pending'
  const statusSignal = signal(status)
  const nodeStatusLabel = status === 'succeeded' ? 'done' : statusSignal.label
  const showStatus = isWatching && status !== 'pending'
  const record = audit?.nodes[id]
  const liveNode = live.nodes[id]
  const cost = liveNode?.costUsd ?? record?.costUsd ?? 0
  const tokens = liveNode?.tokens ?? record?.tokens ?? 0
  const error = liveNode?.error

  return (
    <div
      // relative + a positive z-index keeps this card's own interactive
      // content (the artifact preview's expand button, M1.14b) above React
      // Flow's edge SVG layer — an edge's invisible, wider click-hit stroke
      // can otherwise sit on top of a card its bezier path passes close to.
      className={`relative z-10 w-64 rounded-md border bg-white px-3 py-2 text-sm shadow-sm ${
        selected
          ? 'border-neutral-900'
          : isWatching
            ? statusSignal.borderClass
            : 'border-neutral-300'
      } ${status === 'running' ? 'animate-pulse' : ''}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-neutral-400"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-medium text-neutral-900">{node.id}</span>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            kind === 'tool'
              ? 'bg-neutral-100 text-neutral-600'
              : kind === 'worker'
                ? 'bg-neutral-900 text-white'
                : 'bg-red-100 text-red-700'
          }`}
        >
          {kind}
        </span>
      </div>
      <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">
        {detail}
      </div>
      <div className="mt-1.5 flex min-h-5 items-center gap-1.5">
        {showStatus ? (
          <span className={statusSignal.badgeClass}>
            <span aria-hidden="true">{statusSignal.icon}</span>
            {nodeStatusLabel}
          </span>
        ) : (
          <span className={signal('pending').badgeClass}>
            <span aria-hidden="true">{signal('pending').icon}</span>
            pending
          </span>
        )}
        <span className="truncate font-mono text-[10px] text-neutral-500">
          ${cost.toFixed(4)} · {tokens} tok
        </span>
      </div>
      {error && (
        <div className="mt-1 max-h-10 overflow-hidden rounded border border-red-100 bg-red-50 px-1.5 py-1 text-[10px] leading-tight text-red-700">
          <span title={error}>{error}</span>
        </div>
      )}
      <NodeArtifactPreview record={record} />
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-neutral-400"
      />
    </div>
  )
}

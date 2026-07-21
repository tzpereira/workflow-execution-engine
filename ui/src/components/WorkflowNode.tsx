import { Handle, type NodeProps, Position } from '@xyflow/react'

import type { CanvasNode } from '../core/graph'
import { nodeKind } from '../core/model'
import type { NodeStatus } from '../core/live'
import { useLive } from '../liveStore'
import { NodeArtifactPreview } from './NodeArtifactPreview'

// Border color per live status — cache hits get their own color (amber, not
// green) so they read as visually distinct from a fresh success (REQ-UI-02).
const statusBorder: Record<NodeStatus, string> = {
  pending: 'border-neutral-300',
  running: 'border-blue-500',
  succeeded: 'border-emerald-500',
  cached: 'border-amber-500',
  failed: 'border-red-500',
}

const statusLabel: Record<Exclude<NodeStatus, 'pending'>, string> = {
  running: 'running',
  succeeded: 'done',
  cached: 'cache hit',
  failed: 'failed',
}

const statusTone: Record<NodeStatus, string> = {
  pending: 'bg-neutral-100 text-neutral-500',
  running: 'bg-blue-100 text-blue-700',
  succeeded: 'bg-emerald-100 text-emerald-700',
  cached: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
}

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
            ? statusBorder[status]
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
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${statusTone[status]}`}
          >
            {statusLabel[status]}
          </span>
        ) : (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${statusTone.pending}`}
          >
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

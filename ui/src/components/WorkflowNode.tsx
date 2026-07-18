import { Handle, type NodeProps, Position } from '@xyflow/react'

import type { CanvasNode } from '../core/graph'
import { nodeKind } from '../core/model'

// WorkflowNode renders one graph node. Worker and tool nodes read distinctly (a
// kind badge + the reference), so the graph's two node kinds are legible at a
// glance. Handles on left/right let the user draw dependency edges.
export function WorkflowNode({ data, selected }: NodeProps<CanvasNode>) {
  const node = data.node
  const kind = nodeKind(node)
  const detail = kind === 'tool' ? (node.tool?.toolName ?? '—') : (node.worker ?? '—')

  return (
    <div
      className={`min-w-40 rounded-md border bg-white px-3 py-2 text-sm shadow-sm ${
        selected ? 'border-neutral-900' : 'border-neutral-300'
      }`}
    >
      <Handle type="target" position={Position.Left} className="!bg-neutral-400" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-neutral-900">{node.id}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
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
      <div className="mt-0.5 truncate font-mono text-xs text-neutral-500">{detail}</div>
      <Handle type="source" position={Position.Right} className="!bg-neutral-400" />
    </div>
  )
}

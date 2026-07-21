import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { WorkflowNode } from './WorkflowNode'

const nodeTypes: NodeTypes = { workflow: WorkflowNode }

// Canvas is the center pane: the workflow graph as a React Flow diagram, wired
// straight to the store. Editing here (drag, connect) mutates the same graph
// export reads — there is no separate canvas model.
export function Canvas() {
  const nodes = useWorkspace((s) => s.nodes)
  const edges = useWorkspace((s) => s.edges)
  const onNodesChange = useWorkspace((s) => s.onNodesChange)
  const onEdgesChange = useWorkspace((s) => s.onEdgesChange)
  const onConnect = useWorkspace((s) => s.onConnect)
  const selectNode = useWorkspace((s) => s.selectNode)

  // Data actively flowing into a node currently running a live execution
  // (REQ-UI-02's "animated edge flow") — a pure rendering overlay, never
  // written back into the canonical edge (which carries no `animated` field).
  const liveNodes = useLive((s) => s.live.nodes)
  const isWatching = useLive((s) => s.live.state !== 'idle')

  // React Flow needs each node tagged with its registered type.
  const typedNodes = nodes.map((n) => ({ ...n, type: 'workflow' }))
  const renderedEdges = edges.map((e) => ({
    ...e,
    animated: isWatching && liveNodes[e.target]?.status === 'running',
  }))

  return (
    <div className="relative h-full">
      <ReactFlow
        nodes={typedNodes}
        edges={renderedEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => selectNode(n.id)}
        onPaneClick={() => selectNode(null)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e5e5e5" gap={16} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable className="!bg-neutral-50" />
      </ReactFlow>
      {/* An empty canvas has no other affordance pointing at what to do next
          (M1.14d) — this was the exact confusion behind "nada apareceu na
          UI" earlier: DIR only configures backend path resolution, nothing
          loads until Templates or Import is actually clicked. pointer-events-
          none so it never blocks React Flow's own pane interactions. */}
      {nodes.length === 0 && (
        <div className="pointer-events-none absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-center">
          <div className="empty-canvas-hint rounded-md border border-neutral-200 bg-white px-3 py-2 shadow-sm">
            <p className="text-sm font-medium text-neutral-800">
              No workflow loaded
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Templates or Import start the workspace.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

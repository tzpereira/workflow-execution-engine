import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

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

  // React Flow needs each node tagged with its registered type.
  const typedNodes = nodes.map((n) => ({ ...n, type: 'workflow' }))

  return (
    <ReactFlow
      nodes={typedNodes}
      edges={edges}
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
  )
}

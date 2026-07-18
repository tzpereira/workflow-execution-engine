// The single source of UI state: the canvas graph, the workflow-level metadata
// the graph doesn't carry, and the current selection. Import parses a definition
// into the graph; export rebuilds the canonical definition from it. The store
// never holds a "second" workflow representation — the graph plus meta *is* the
// workflow (PRIN-02).

import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react'
import { create } from 'zustand'

import {
  type CanvasEdge,
  type CanvasGraph,
  type CanvasNode,
  fromGraph,
  metaOf,
  toGraph,
  type WorkflowMeta,
} from './core/graph'
import type { Node as WFNode, Workflow } from './core/model'
import { type Format, formatForPath, parseWorkflow, serializeWorkflow } from './core/serialize'

const emptyMeta: WorkflowMeta = {
  id: 'untitled',
  version: '0.1.0',
  budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 },
}

export interface WorkspaceState {
  meta: WorkflowMeta
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  selectedNodeId: string | null
  fileName: string | null
  error: string | null

  importText: (text: string, format: Format, fileName?: string) => void
  importFromPath: (text: string, path: string) => void
  exportText: (format: Format) => string
  workflow: () => Workflow

  onNodesChange: (changes: NodeChange<CanvasNode>[]) => void
  onEdgesChange: (changes: EdgeChange<CanvasEdge>[]) => void
  onConnect: (conn: Connection) => void

  addNode: (node: WFNode, position?: { x: number; y: number }) => void
  updateNodeBody: (id: string, node: WFNode) => void
  selectNode: (id: string | null) => void
  setMeta: (meta: WorkflowMeta) => void
}

function graphOf(state: WorkspaceState): CanvasGraph {
  return { nodes: state.nodes, edges: state.edges }
}

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  meta: emptyMeta,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  fileName: null,
  error: null,

  importText: (text, format, fileName) => {
    try {
      const wf = parseWorkflow(text, format)
      const graph = toGraph(wf)
      set({
        meta: metaOf(wf),
        nodes: graph.nodes,
        edges: graph.edges,
        selectedNodeId: null,
        fileName: fileName ?? null,
        error: null,
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  importFromPath: (text, path) => get().importText(text, formatForPath(path), path),

  exportText: (format) => serializeWorkflow(get().workflow(), format),

  workflow: () => fromGraph(graphOf(get()), get().meta),

  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (conn) => set({ edges: addEdge(conn, get().edges) }),

  addNode: (node, position) => {
    const canvasNode: CanvasNode = {
      id: node.id,
      position: position ?? { x: 40, y: 40 },
      data: { node },
    }
    set({ nodes: [...get().nodes, canvasNode], selectedNodeId: node.id })
  },

  updateNodeBody: (id, node) =>
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { node } } : n)),
    }),

  selectNode: (id) => set({ selectedNodeId: id }),
  setMeta: (meta) => set({ meta }),
}))

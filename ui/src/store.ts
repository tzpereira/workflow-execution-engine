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
import {
  type Format,
  formatForPath,
  parseWorkflow,
  serializeWorkflow,
} from './core/serialize'

const emptyMeta: WorkflowMeta = {
  id: 'untitled',
  version: '0.1.0',
  budget: {
    maxCostUsd: 0,
    maxTokens: 0,
    maxDurationMs: 0,
    maxRetriesPerNode: 0,
  },
}

export interface WorkspaceDocument {
  id: string
  label: string
  meta: WorkflowMeta
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  fileName: string | null
  dirty: boolean
}

interface WorkspaceSnapshot {
  meta: WorkflowMeta
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  selectedNodeId: string | null
  fileName: string | null
  error: string | null
  documents: WorkspaceDocument[]
  activeDocumentId: string
}

export interface WorkspaceState {
  meta: WorkflowMeta
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  selectedNodeId: string | null
  fileName: string | null
  error: string | null
  documents: WorkspaceDocument[]
  activeDocumentId: string
  history: WorkspaceSnapshot[]

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
  newDocument: () => void
  switchDocument: (id: string) => void
  closeDocument: (id: string) => void
  markSaved: () => void
  relayout: () => void
  undo: () => void
}

function graphOf(state: WorkspaceState): CanvasGraph {
  return { nodes: state.nodes, edges: state.edges }
}

function documentFromState(
  state: WorkspaceState,
  dirty: boolean,
): WorkspaceDocument {
  return {
    id: state.activeDocumentId,
    label: state.fileName ?? state.meta.id,
    meta: state.meta,
    nodes: state.nodes,
    edges: state.edges,
    fileName: state.fileName,
    dirty,
  }
}

function applyCurrentDocument(state: WorkspaceState, dirty = true) {
  return {
    documents: state.documents.map((doc) =>
      doc.id === state.activeDocumentId ? documentFromState(state, dirty) : doc,
    ),
  }
}

function createDocument(id: string): WorkspaceDocument {
  return {
    id,
    label: id,
    meta: { ...emptyMeta, id },
    nodes: [],
    edges: [],
    fileName: null,
    dirty: false,
  }
}

function snapshotOf(state: WorkspaceState): WorkspaceSnapshot {
  return {
    meta: state.meta,
    nodes: state.nodes,
    edges: state.edges,
    selectedNodeId: state.selectedNodeId,
    fileName: state.fileName,
    error: state.error,
    documents: state.documents,
    activeDocumentId: state.activeDocumentId,
  }
}

function pushHistory(state: WorkspaceState): WorkspaceSnapshot[] {
  return [...state.history, snapshotOf(state)].slice(-50)
}

function nextNodePosition(nodes: CanvasNode[]) {
  if (nodes.length === 0) return { x: 80, y: 80 }
  const columns = 3
  const taken = new Set(
    nodes.map(
      (n) =>
        `${Math.round(n.position.x / 280)}:${Math.round(n.position.y / 180)}`,
    ),
  )
  for (let i = 0; i < nodes.length + 12; i++) {
    const col = i % columns
    const row = Math.floor(i / columns)
    if (!taken.has(`${col}:${row}`))
      return { x: 80 + col * 280, y: 80 + row * 180 }
  }
  return { x: 80, y: 80 + Math.ceil(nodes.length / columns) * 180 }
}

function layoutNodes(nodes: CanvasNode[]) {
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: 80 + (index % 3) * 300,
      y: 80 + Math.floor(index / 3) * 190,
    },
  }))
}

const initialDocument = createDocument('untitled')

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  meta: initialDocument.meta,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  fileName: null,
  error: null,
  documents: [initialDocument],
  activeDocumentId: initialDocument.id,
  history: [],

  importText: (text, format, fileName) => {
    try {
      const wf = parseWorkflow(text, format)
      const graph = toGraph(wf)
      set((state) => {
        const next = {
          ...state,
          meta: metaOf(wf),
          nodes: graph.nodes,
          edges: graph.edges,
          selectedNodeId: null,
          fileName: fileName ?? null,
          error: null,
        }
        return {
          ...next,
          history: pushHistory(state),
          ...applyCurrentDocument(next, false),
        }
      })
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  importFromPath: (text, path) =>
    get().importText(text, formatForPath(path), path),

  exportText: (format) => serializeWorkflow(get().workflow(), format),

  workflow: () => fromGraph(graphOf(get()), get().meta),

  onNodesChange: (changes) =>
    set((state) => {
      const next = { ...state, nodes: applyNodeChanges(changes, state.nodes) }
      return {
        nodes: next.nodes,
        history: pushHistory(state),
        ...applyCurrentDocument(next),
      }
    }),
  onEdgesChange: (changes) =>
    set((state) => {
      const next = { ...state, edges: applyEdgeChanges(changes, state.edges) }
      return {
        edges: next.edges,
        history: pushHistory(state),
        ...applyCurrentDocument(next),
      }
    }),
  onConnect: (conn) =>
    set((state) => {
      const next = { ...state, edges: addEdge(conn, state.edges) }
      return {
        edges: next.edges,
        history: pushHistory(state),
        ...applyCurrentDocument(next),
      }
    }),

  addNode: (node, position) => {
    const canvasNode: CanvasNode = {
      id: node.id,
      position: position ?? nextNodePosition(get().nodes),
      data: { node },
    }
    set((state) => {
      const next = {
        ...state,
        nodes: [...state.nodes, canvasNode],
        selectedNodeId: node.id,
      }
      return {
        nodes: next.nodes,
        selectedNodeId: node.id,
        history: pushHistory(state),
        ...applyCurrentDocument(next),
      }
    })
  },

  updateNodeBody: (id, node) =>
    set((state) => {
      const next = {
        ...state,
        nodes: state.nodes.map((n) =>
          n.id === id ? { ...n, id: node.id, data: { node } } : n,
        ),
        edges: state.edges.map((edge) => ({
          ...edge,
          source: edge.source === id ? node.id : edge.source,
          target: edge.target === id ? node.id : edge.target,
        })),
        selectedNodeId:
          state.selectedNodeId === id ? node.id : state.selectedNodeId,
      }
      return {
        nodes: next.nodes,
        edges: next.edges,
        selectedNodeId: next.selectedNodeId,
        history: pushHistory(state),
        ...applyCurrentDocument(next),
      }
    }),

  selectNode: (id) => set({ selectedNodeId: id }),
  setMeta: (meta) =>
    set((state) => {
      const next = { ...state, meta }
      return {
        meta,
        history: pushHistory(state),
        ...applyCurrentDocument(next),
      }
    }),
  newDocument: () =>
    set((state) => {
      const id = uniqueDocumentId(state.documents)
      const doc = createDocument(id)
      return {
        documents: [...state.documents, doc],
        activeDocumentId: doc.id,
        meta: doc.meta,
        nodes: doc.nodes,
        edges: doc.edges,
        selectedNodeId: null,
        fileName: doc.fileName,
        error: null,
        history: pushHistory(state),
      }
    }),
  switchDocument: (id) =>
    set((state) => {
      const doc = state.documents.find((d) => d.id === id)
      if (!doc) return {}
      return {
        activeDocumentId: doc.id,
        meta: doc.meta,
        nodes: doc.nodes,
        edges: doc.edges,
        selectedNodeId: null,
        fileName: doc.fileName,
        error: null,
      }
    }),
  closeDocument: (id) =>
    set((state) => {
      if (state.documents.length <= 1) return {}
      const docs = state.documents.filter((doc) => doc.id !== id)
      const active =
        id === state.activeDocumentId
          ? docs[0]
          : (state.documents.find((doc) => doc.id === state.activeDocumentId) ??
            docs[0])
      return {
        documents: docs,
        activeDocumentId: active.id,
        meta: active.meta,
        nodes: active.nodes,
        edges: active.edges,
        selectedNodeId: null,
        fileName: active.fileName,
        error: null,
      }
    }),
  markSaved: () => set((state) => applyCurrentDocument(state, false)),
  relayout: () =>
    set((state) => {
      const next = { ...state, nodes: layoutNodes(state.nodes) }
      return {
        nodes: next.nodes,
        history: pushHistory(state),
        ...applyCurrentDocument(next),
      }
    }),
  undo: () =>
    set((state) => {
      const previous = state.history[state.history.length - 1]
      if (!previous) return {}
      return {
        ...previous,
        history: state.history.slice(0, -1),
      }
    }),
}))

function uniqueDocumentId(docs: WorkspaceDocument[]) {
  let i = docs.length + 1
  while (docs.some((doc) => doc.id === `untitled-${i}`)) i++
  return `untitled-${i}`
}

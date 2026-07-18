// Map the canonical Workflow onto a React Flow graph and back. The canvas adds
// exactly one thing the definition doesn't have — node positions — and this
// module keeps that strictly UI-side: fromGraph drops positions, so nothing the
// user drags ever changes the exported definition. Everything else (node
// bodies, edge conditions, order) survives the round-trip untouched, which is
// what makes REQ-UI-01's "zero drift" true by construction.

import type { Edge as RFEdge, Node as RFNode } from '@xyflow/react'
import type { Condition, Edge as WFEdge, Node as WFNode, Workflow } from './model'

export interface XY {
  x: number
  y: number
}

// React Flow constrains node/edge data to Record<string, unknown>, so the
// canonical node/edge are carried inside a data wrapper that satisfies it.
export interface CanvasNodeData extends Record<string, unknown> {
  node: WFNode
}
export interface CanvasEdgeData extends Record<string, unknown> {
  condition?: Condition
}

export type CanvasNode = RFNode<CanvasNodeData>
export type CanvasEdge = RFEdge<CanvasEdgeData>

export interface CanvasGraph {
  nodes: CanvasNode[]
  edges: CanvasEdge[]
}

/** Workflow-level fields the canvas graph does not carry, needed to rebuild a
 *  Workflow from it. */
export interface WorkflowMeta {
  id: string
  version: string
  budget: Workflow['budget']
  defaults?: Workflow['defaults']
}

const COL_GAP = 260
const ROW_GAP = 120

/** toGraph renders a Workflow as React Flow nodes/edges. Positions come from the
 *  optional `positions` map (persisted canvas state); any node without one gets
 *  a simple layered auto-layout so an imported definition is legible at once. */
export function toGraph(wf: Workflow, positions?: Record<string, XY>): CanvasGraph {
  const depth = layerDepths(wf)
  const filledRows: Record<number, number> = {}
  const nodes: CanvasNode[] = wf.nodes.map((n) => {
    const layer = depth[n.id] ?? 0
    const row = filledRows[layer] ?? 0
    filledRows[layer] = row + 1
    const position = positions?.[n.id] ?? { x: layer * COL_GAP, y: row * ROW_GAP }
    return { id: n.id, position, data: { node: n } }
  })
  const edges: CanvasEdge[] = wf.edges.map((e, i) => ({
    id: `e${i}:${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    data: e.condition ? { condition: e.condition } : undefined,
  }))
  return { nodes, edges }
}

/** fromGraph rebuilds the canonical Workflow from the canvas. Positions are
 *  discarded; node bodies and edge conditions are preserved; node/edge order
 *  follows the canvas arrays. `meta` supplies the workflow-level fields. */
export function fromGraph(graph: CanvasGraph, meta: WorkflowMeta): Workflow {
  const nodes: WFNode[] = graph.nodes.map((n) => n.data.node)
  const edges: WFEdge[] = graph.edges.map((e) => {
    const edge: WFEdge = { from: e.source, to: e.target }
    if (e.data?.condition) edge.condition = e.data.condition
    return edge
  })
  const wf: Workflow = {
    id: meta.id,
    version: meta.version,
    nodes,
    edges,
    budget: meta.budget,
  }
  if (meta.defaults) wf.defaults = meta.defaults
  return wf
}

/** metaOf extracts the workflow-level fields toGraph/fromGraph don't carry. */
export function metaOf(wf: Workflow): WorkflowMeta {
  const meta: WorkflowMeta = { id: wf.id, version: wf.version, budget: wf.budget }
  if (wf.defaults) meta.defaults = wf.defaults
  return meta
}

/** layerDepths assigns each node the length of the longest path of incoming
 *  edges reaching it (roots at 0), for a left-to-right layered layout. A cycle
 *  (which validation would reject anyway) is broken by the visit guard. */
function layerDepths(wf: Workflow): Record<string, number> {
  const parents: Record<string, string[]> = {}
  for (const n of wf.nodes) parents[n.id] = []
  for (const e of wf.edges) parents[e.to]?.push(e.from)

  const depth: Record<string, number> = {}
  const visiting = new Set<string>()
  const compute = (id: string): number => {
    if (depth[id] != null) return depth[id]
    if (visiting.has(id)) return 0 // cycle guard
    visiting.add(id)
    let d = 0
    for (const p of parents[id] ?? []) d = Math.max(d, compute(p) + 1)
    visiting.delete(id)
    depth[id] = d
    return d
  }
  for (const n of wf.nodes) compute(n.id)
  return depth
}

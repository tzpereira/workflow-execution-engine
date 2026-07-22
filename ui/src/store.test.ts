import { beforeEach, describe, expect, it } from 'vitest'

import { parseWorkflow } from './core/serialize'
import { useWorkspace } from './store'

const yaml = `id: demo
version: 1.0.0
nodes:
  - id: a
    worker: wa@1.0.0
  - id: b
    tool:
      toolName: terminal
      input:
        command: echo
edges:
  - from: a
    to: b
budget:
  maxCostUsd: 1
  maxTokens: 100
  maxDurationMs: 1000
  maxRetriesPerNode: 0
`

function reset() {
  const meta = {
    id: 'untitled',
    version: '0.1.0',
    budget: {
      maxCostUsd: 0,
      maxTokens: 0,
      maxDurationMs: 0,
      maxRetriesPerNode: 0,
    },
  }
  useWorkspace.setState({
    meta,
    nodes: [],
    edges: [],
    selectedNodeId: null,
    fileName: null,
    error: null,
    activeDocumentId: 'untitled',
    history: [],
    documents: [
      {
        id: 'untitled',
        label: 'untitled',
        meta,
        nodes: [],
        edges: [],
        fileName: null,
        dirty: false,
      },
    ],
  })
}

describe('workspace store', () => {
  beforeEach(reset)

  it('import then export preserves the workflow semantically', () => {
    const s = useWorkspace.getState()
    s.importText(yaml, 'yaml', 'demo.yaml')
    const exported = useWorkspace.getState().exportText('yaml')
    expect(parseWorkflow(exported, 'yaml')).toEqual(parseWorkflow(yaml, 'yaml'))
  })

  it('import populates the canvas graph', () => {
    useWorkspace.getState().importText(yaml, 'yaml')
    const st = useWorkspace.getState()
    expect(st.nodes.map((n) => n.id)).toEqual(['a', 'b'])
    expect(st.edges).toHaveLength(1)
    expect(st.fileName).toBe(null)
  })

  it('reports a parse error instead of throwing', () => {
    useWorkspace.getState().importText(': not: valid: yaml:', 'yaml')
    expect(useWorkspace.getState().error).not.toBe(null)
  })

  it('addNode and onConnect mutate the graph', () => {
    const s = useWorkspace.getState()
    s.addNode({ id: 'x', worker: 'wx@1.0.0' })
    s.addNode({ id: 'y', tool: { toolName: 't', input: {} } })
    useWorkspace
      .getState()
      .onConnect({
        source: 'x',
        target: 'y',
        sourceHandle: null,
        targetHandle: null,
      })
    const st = useWorkspace.getState()
    expect(st.nodes.map((n) => n.id)).toEqual(['x', 'y'])
    expect(st.edges).toHaveLength(1)
    expect(st.edges[0].source).toBe('x')
  })

  it('renames a node body and rewrites connected edges', () => {
    const s = useWorkspace.getState()
    s.addNode({ id: 'x', worker: 'wx@1.0.0' })
    s.addNode({ id: 'y', tool: { toolName: 't', input: {} } })
    useWorkspace
      .getState()
      .onConnect({
        source: 'x',
        target: 'y',
        sourceHandle: null,
        targetHandle: null,
      })
    useWorkspace.getState().selectNode('x')

    useWorkspace
      .getState()
      .updateNodeBody('x', { id: 'renamed', worker: 'wx@1.0.1' })

    const st = useWorkspace.getState()
    expect(st.nodes.map((n) => n.id)).toEqual(['renamed', 'y'])
    expect(st.edges[0].source).toBe('renamed')
    expect(st.selectedNodeId).toBe('renamed')
  })

  it('undo restores the previous authoring state', () => {
    const s = useWorkspace.getState()
    s.addNode({ id: 'x', worker: 'wx@1.0.0' })
    s.addNode({ id: 'y', tool: { toolName: 't', input: {} } })
    expect(useWorkspace.getState().nodes.map((n) => n.id)).toEqual(['x', 'y'])

    useWorkspace.getState().undo()

    expect(useWorkspace.getState().nodes.map((n) => n.id)).toEqual(['x'])
  })

  it('places added nodes without overlap and can re-layout them', () => {
    const s = useWorkspace.getState()
    s.addNode({ id: 'x', worker: 'wx@1.0.0' })
    s.addNode({ id: 'y', tool: { toolName: 't', input: {} } })
    const positions = useWorkspace.getState().nodes.map((n) => n.position)
    expect(new Set(positions.map((p) => `${p.x}:${p.y}`)).size).toBe(2)

    useWorkspace.getState().relayout()
    expect(useWorkspace.getState().nodes[0].position).toEqual({ x: 80, y: 80 })
  })

  it('keeps a 200-node canvas layout non-overlapping', () => {
    const s = useWorkspace.getState()
    for (let i = 0; i < 200; i += 1) {
      s.addNode({ id: `n-${i}`, worker: 'wx@1.0.0' })
    }

    useWorkspace.getState().relayout()
    const positions = useWorkspace.getState().nodes.map((n) => n.position)
    expect(new Set(positions.map((p) => `${p.x}:${p.y}`)).size).toBe(200)
  })

  it('tracks workflow documents with dirty indicators', () => {
    const s = useWorkspace.getState()
    s.addNode({ id: 'x', worker: 'wx@1.0.0' })
    expect(useWorkspace.getState().documents[0].dirty).toBe(true)
    useWorkspace.getState().markSaved()
    expect(useWorkspace.getState().documents[0].dirty).toBe(false)

    useWorkspace.getState().newDocument()
    expect(useWorkspace.getState().documents).toHaveLength(2)
    expect(useWorkspace.getState().activeDocumentId).toBe('untitled-2')

    useWorkspace.getState().switchDocument('untitled')
    expect(useWorkspace.getState().meta.id).toBe('untitled')
  })
})

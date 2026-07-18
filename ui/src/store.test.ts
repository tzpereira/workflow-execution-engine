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
  useWorkspace.setState({ meta: { id: 'untitled', version: '0.1.0', budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 } }, nodes: [], edges: [], selectedNodeId: null, fileName: null, error: null })
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
    useWorkspace.getState().onConnect({ source: 'x', target: 'y', sourceHandle: null, targetHandle: null })
    const st = useWorkspace.getState()
    expect(st.nodes.map((n) => n.id)).toEqual(['x', 'y'])
    expect(st.edges).toHaveLength(1)
    expect(st.edges[0].source).toBe('x')
  })
})

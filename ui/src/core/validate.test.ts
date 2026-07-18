import { describe, expect, it } from 'vitest'

import type { Workflow } from './model'
import { validateWorkflow } from './validate'

const budget = { maxCostUsd: 1, maxTokens: 1, maxDurationMs: 1, maxRetriesPerNode: 0 }

describe('validateWorkflow', () => {
  it('accepts a well-formed graph', () => {
    const wf: Workflow = {
      id: 'ok',
      version: '1.0.0',
      nodes: [
        { id: 'a', worker: 'wa@1.0.0' },
        { id: 'b', tool: { toolName: 't', input: {} } },
      ],
      edges: [{ from: 'a', to: 'b' }],
      budget,
    }
    expect(validateWorkflow(wf)).toEqual([])
  })

  it('flags a node with neither worker nor tool, and a dangling edge', () => {
    const wf: Workflow = {
      id: 'bad',
      version: '1.0.0',
      nodes: [{ id: 'a' }],
      edges: [{ from: 'a', to: 'ghost' }],
      budget,
    }
    const problems = validateWorkflow(wf)
    expect(problems.some((p) => p.includes('exactly one'))).toBe(true)
    expect(problems.some((p) => p.includes('ghost'))).toBe(true)
  })

  it('flags a node with both a worker and a tool', () => {
    const wf: Workflow = {
      id: 'both',
      version: '1.0.0',
      nodes: [{ id: 'a', worker: 'w@1.0.0', tool: { toolName: 't', input: {} } }],
      edges: [],
      budget,
    }
    expect(validateWorkflow(wf).some((p) => p.includes('exactly one'))).toBe(true)
  })
})

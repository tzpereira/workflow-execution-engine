import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { useWorkspace } from '../store'
import { Canvas } from './Canvas'

function resetWorkspace() {
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
    nodes: [
      {
        id: 'a',
        position: { x: 0, y: 0 },
        data: { node: { id: 'a', worker: 'a@1.0.0' } },
      },
    ],
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

describe('Canvas', () => {
  beforeEach(resetWorkspace)

  it('themes React Flow controls and minimap through WEE classes', () => {
    const { container } = render(<Canvas />)

    expect(container.querySelector('.wee-flow')).toBeInTheDocument()
    expect(container.querySelector('.wee-flow-controls')).toBeInTheDocument()
    expect(container.querySelector('.wee-flow-minimap')).toBeInTheDocument()
  })
})

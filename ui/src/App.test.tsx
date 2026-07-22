import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import App from './App'
import { useWorkspace } from './store'

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

// Smoke test for the single-workspace shell: the toolbar, canvas, inspector,
// and timeline panels all mount together. React Flow renders via the
// ResizeObserver stub in test/setup.ts.
describe('App', () => {
  beforeEach(resetWorkspace)

  it('renders the workspace shell after importing a workflow', () => {
    useWorkspace
      .getState()
      .importText(
        'id: demo\nversion: 1.0.0\nnodes:\n  - id: a\n    worker: wa@1.0.0\nedges: []\nbudget:\n  maxCostUsd: 1\n  maxTokens: 1\n  maxDurationMs: 1\n  maxRetriesPerNode: 0\n',
        'yaml',
      )
    render(<App />)

    // The workflow id shows (toolbar + inspector); the canvas region and the
    // import control are present — the four panels mounted together.
    expect(screen.getAllByText('demo').length).toBeGreaterThan(0)
    expect(screen.getByRole('main', { name: /canvas/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('minimizes and restores the right and bottom panels with icon controls', () => {
    useWorkspace
      .getState()
      .importText(
        'id: demo\nversion: 1.0.0\nnodes:\n  - id: a\n    worker: wa@1.0.0\nedges: []\nbudget:\n  maxCostUsd: 1\n  maxTokens: 1\n  maxDurationMs: 1\n  maxRetriesPerNode: 0\n',
        'yaml',
      )
    render(<App />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Minimize right panel' }),
    )
    expect(
      screen.getByRole('button', { name: 'Restore right panel' }),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Restore right panel' }))
    expect(
      screen.getByRole('button', { name: 'Maximize right panel' }),
    ).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'Minimize bottom panel' }),
    )
    expect(
      screen.getByRole('button', { name: 'Restore bottom panel' }),
    ).toBeInTheDocument()
  })

  it('adds nodes and undoes authoring actions with keyboard shortcuts', () => {
    render(<App />)

    fireEvent.keyDown(window, { key: 'w', metaKey: true })
    fireEvent.keyDown(window, { key: 't', metaKey: true })

    expect(useWorkspace.getState().workflow().nodes).toEqual([
      { id: 'worker-1', worker: 'worker-1@1.0.0' },
      { id: 'tool-1', tool: { toolName: 'terminal', input: {} } },
    ])

    fireEvent.keyDown(window, { key: 'z', metaKey: true })

    expect(useWorkspace.getState().workflow().nodes).toEqual([
      { id: 'worker-1', worker: 'worker-1@1.0.0' },
    ])
  })
})

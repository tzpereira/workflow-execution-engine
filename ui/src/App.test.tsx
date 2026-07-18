import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import App from './App'
import { useWorkspace } from './store'

// Smoke test for the single-workspace shell: the toolbar, canvas, inspector,
// and timeline panels all mount together. React Flow renders via the
// ResizeObserver stub in test/setup.ts.
describe('App', () => {
  it('renders the workspace shell after importing a workflow', () => {
    useWorkspace.getState().importText(
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
})

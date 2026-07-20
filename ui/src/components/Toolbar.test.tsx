import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { Toolbar } from './Toolbar'

function resetStores() {
  useLive.getState().disconnect()
  useLive.setState({ serverUrl: 'http://127.0.0.1:7676', error: null })
  useWorkspace.setState({
    meta: { id: 'wf', version: '1.0.0', budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 } },
    nodes: [],
    edges: [],
    selectedNodeId: null,
    fileName: 'wf.yaml',
    error: null,
  })
}

// Toolbar's Run button is the interface-side trigger for REQ-INPUT-01: a
// workflow with declared Inputs must pause for the RunInputsModal before
// calling useLive's run(); one with none must call it immediately, unchanged.
describe('Toolbar', () => {
  beforeEach(() => {
    resetStores()
    vi.restoreAllMocks()
  })

  it('runs immediately when the workflow declares no inputs', () => {
    const run = vi.fn()
    useLive.setState({ run })
    render(<Toolbar onOpenPalette={() => {}} onOpenTemplates={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))

    expect(run).toHaveBeenCalledWith('wf.yaml', [])
    expect(screen.queryByText('Run inputs')).not.toBeInTheDocument()
  })

  it('opens the inputs modal first when the workflow declares inputs, then runs with the collected values', () => {
    const run = vi.fn()
    useLive.setState({ run })
    useWorkspace.setState((s) => ({ meta: { ...s.meta, inputs: [{ name: 'prUrl', required: true }] } }))
    render(<Toolbar onOpenPalette={() => {}} onOpenTemplates={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Run' }))
    expect(screen.getByText('Run inputs')).toBeInTheDocument()
    expect(run).not.toHaveBeenCalled()

    fireEvent.change(screen.getByRole('textbox', { name: 'prUrl' }), { target: { value: 'https://example.com/42' } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Run' })[1])

    expect(run).toHaveBeenCalledWith('wf.yaml', [], { prUrl: 'https://example.com/42' })
    expect(screen.queryByText('Run inputs')).not.toBeInTheDocument()
  })
})

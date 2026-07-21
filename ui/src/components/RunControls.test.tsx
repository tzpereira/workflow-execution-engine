import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Audit } from '../core/audit'
import { emptyLive } from '../core/live'
import { useLive } from '../liveStore'
import { RunControls } from './RunControls'

const original = {
  cancel: useLive.getState().cancel,
  retry: useLive.getState().retry,
  reexecute: useLive.getState().reexecute,
  clearNodeCache: useLive.getState().clearNodeCache,
}

afterEach(() => {
  useLive.setState({ live: emptyLive(), audit: null, connected: false, ...original })
})

function seedTerminal(state: 'succeeded' | 'failed' | 'cancelled') {
  useLive.setState({
    live: { ...emptyLive(['a']), executionId: 'e1', state },
    audit: { executionId: 'e1', workflow: { nodes: [{ id: 'a' }] } } as unknown as Audit,
    connected: false,
  })
}

describe('RunControls', () => {
  it('renders nothing without a current execution', () => {
    const { container } = render(<RunControls />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows Cancel while a run is connected/in flight', () => {
    const cancel = vi.fn(async () => undefined)
    useLive.setState({
      live: { ...emptyLive(['a']), executionId: 'e1', state: 'running' },
      audit: { executionId: 'e1', workflow: { nodes: [{ id: 'a' }] } } as unknown as Audit,
      connected: true,
      cancel,
    })
    render(<RunControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(cancel).toHaveBeenCalled()
    // No resume/re-run while still running.
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
  })

  it('offers Resume for a failed run and Re-run for any terminal run', () => {
    const retry = vi.fn(async () => undefined)
    seedTerminal('failed')
    useLive.setState({ retry })
    render(<RunControls />)
    expect(screen.getByRole('button', { name: 'Re-run' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(retry).toHaveBeenCalled()
  })

  it('offers Re-run but not Resume for a succeeded run', () => {
    seedTerminal('succeeded')
    render(<RunControls />)
    expect(screen.getByRole('button', { name: 'Re-run' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument()
  })

  it('resumes a reconciled (cancelled) execution — the interrupted-run path', () => {
    const retry = vi.fn(async () => undefined)
    seedTerminal('cancelled')
    useLive.setState({ retry })
    render(<RunControls />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(retry).toHaveBeenCalled()
  })

  it('exposes an Export bundle download link for the current execution', () => {
    seedTerminal('succeeded')
    useLive.setState({ serverUrl: 'http://s' })
    render(<RunControls />)
    const link = screen.getByTestId('export-bundle')
    expect(link).toHaveAttribute('href', 'http://s/api/executions/e1/bundle')
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Audit } from '../core/audit'
import { emptyLive } from '../core/live'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { Timeline } from './Timeline'

const originalRetry = useLive.getState().retry
const originalReexecute = useLive.getState().reexecute

afterEach(() => {
  useLive.setState({
    live: emptyLive(),
    audit: null,
    connected: false,
    retry: originalRetry,
    reexecute: originalReexecute,
  })
  useWorkspace.setState({ nodes: [], edges: [], fileName: null })
})

describe('Timeline run controls', () => {
  it('Resume continues a failed execution via the durable retry action', () => {
    const retry = vi.fn(async () => undefined)
    useLive.setState({
      live: { ...emptyLive(['review']), executionId: 'exec-1', state: 'failed' },
      audit: { executionId: 'exec-1', workflow: { nodes: [{ id: 'review' }] } } as unknown as Audit,
      connected: false,
      retry,
    })

    render(<Timeline />)
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    expect(retry).toHaveBeenCalled()
  })

  it('Re-run re-executes a finished execution as a new run', () => {
    const reexecute = vi.fn(async () => undefined)
    useLive.setState({
      live: { ...emptyLive(['review']), executionId: 'exec-2', state: 'succeeded' },
      audit: { executionId: 'exec-2', workflow: { nodes: [{ id: 'review' }] } } as unknown as Audit,
      connected: false,
      reexecute,
    })

    render(<Timeline />)
    fireEvent.click(screen.getByRole('button', { name: 'Re-run' }))

    expect(reexecute).toHaveBeenCalled()
  })
})

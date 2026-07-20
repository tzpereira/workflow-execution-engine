import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Audit } from '../core/audit'
import { emptyLive } from '../core/live'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { Timeline } from './Timeline'

const originalRun = useLive.getState().run

afterEach(() => {
  useLive.setState({ live: emptyLive(), audit: null, connected: false, run: originalRun })
  useWorkspace.setState({ nodes: [], edges: [], fileName: null })
})

describe('Timeline retry', () => {
  it('starts a new cached run with the failed execution inputs', () => {
    const run = vi.fn(async () => undefined)
    const inputs = { prUrl: 'https://api.github.com/repos/o/r/pulls/1' }
    useWorkspace.getState().importText(
      `id: pr-review
version: 1.1.0
nodes:
  - id: review
    worker: reviewer@1.1.0
edges: []
budget:
  maxCostUsd: 0.03
  maxTokens: 30000
  maxDurationMs: 90000
  maxRetriesPerNode: 1
`,
      'yaml',
      'pr-review/workflow.yaml',
    )
    useLive.setState({
      live: { ...emptyLive(['review']), executionId: 'exec-1', state: 'failed' },
      audit: { inputs } as unknown as Audit,
      connected: false,
      run,
    })

    render(<Timeline />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry failed' }))

    expect(run).toHaveBeenCalledWith('pr-review/workflow.yaml', ['review'], inputs)
  })
})

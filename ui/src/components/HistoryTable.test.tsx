import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { emptyLive } from '../core/live'
import { useLive } from '../liveStore'
import { HistoryTable } from './HistoryTable'

function resetLive() {
  useLive.getState().disconnect()
  useLive.setState({ live: emptyLive(), audit: null, executions: [], executionsError: null, error: null })
}

describe('HistoryTable', () => {
  beforeEach(() => {
    resetLive()
  })

  it('loads executions on mount and renders a row per execution', async () => {
    useLive.setState({
      executions: [
        { id: 'wf-1', workflow: 'demo', version: '1.0.0', state: 'succeeded', spentCostUsd: 0.02, spentTokens: 10, durationMs: 4000 },
        { id: 'wf-2', workflow: 'demo', version: '1.0.0', state: 'failed', spentCostUsd: 0.01, spentTokens: 5, durationMs: 1000 },
      ],
    })
    render(<HistoryTable />)

    expect(screen.getByText('wf-1')).toBeInTheDocument()
    expect(screen.getByText('wf-2')).toBeInTheDocument()
    expect(screen.getByText('$0.0200')).toBeInTheDocument()
    expect(screen.getByText('4.0s')).toBeInTheDocument()
  })

  it('shows the executionsError and a placeholder for an empty list', () => {
    useLive.setState({ executionsError: 'server unreachable' })
    render(<HistoryTable />)
    expect(screen.getByText('server unreachable')).toBeInTheDocument()
    expect(screen.getByText('no executions recorded yet')).toBeInTheDocument()
  })

  it('sorts by a clicked column, toggling direction on a second click', () => {
    useLive.setState({
      executions: [
        { id: 'a', workflow: 'demo', version: '1.0.0', state: 'succeeded', spentCostUsd: 0.05, spentTokens: 10, durationMs: 1000 },
        { id: 'b', workflow: 'demo', version: '1.0.0', state: 'succeeded', spentCostUsd: 0.01, spentTokens: 5, durationMs: 2000 },
      ],
    })
    render(<HistoryTable />)

    const rowsInOrder = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent ?? '')

    fireEvent.click(screen.getByRole('button', { name: /cost/ }))
    expect(rowsInOrder()[0]).toContain('a') // desc by default: 0.05 before 0.01

    fireEvent.click(screen.getByRole('button', { name: /cost/ }))
    expect(rowsInOrder()[0]).toContain('b') // second click flips to asc: 0.01 first
  })

  it('clicking a row loads it as the historical execution', () => {
    useLive.setState({
      executions: [{ id: 'wf-1', workflow: 'demo', version: '1.0.0', state: 'succeeded', spentCostUsd: 0.02, spentTokens: 10, durationMs: 4000 }],
    })
    const loadHistorical = vi.fn(async () => {})
    useLive.setState({ loadHistorical })
    render(<HistoryTable />)

    fireEvent.click(screen.getByText('wf-1'))
    expect(loadHistorical).toHaveBeenCalledWith('wf-1')
  })

  it('the refresh button re-fetches the list', () => {
    const loadExecutions = vi.fn(async () => {})
    useLive.setState({ loadExecutions })
    render(<HistoryTable />)

    loadExecutions.mockClear() // clear the mount-time call so this only asserts the click
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    expect(loadExecutions).toHaveBeenCalledTimes(1)
  })
})

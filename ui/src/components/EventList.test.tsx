import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { WFEvent } from '../core/live'
import { EventList } from './EventList'

const events: WFEvent[] = [
  { type: 'ExecutionStarted', timestamp: '2026-01-01T00:00:00Z', executionId: 'x', prevHash: '', payload: { workflow: 'wf' } },
  { type: 'WorkerStarted', timestamp: '2026-01-01T00:00:01Z', executionId: 'x', nodeId: 'a', prevHash: '' },
  { type: 'WorkerFinished', timestamp: '2026-01-01T00:00:02Z', executionId: 'x', nodeId: 'a', prevHash: '', payload: { costUsd: 0.01 } },
  { type: 'WorkerStarted', timestamp: '2026-01-01T00:00:01Z', executionId: 'x', nodeId: 'b', prevHash: '' },
]

// Row text (e.g. "WorkerStarted") also appears as an <option> in the type
// filter <select> — every lookup below is scoped to the <span> a log row
// renders its type in, never a bare getByText/getAllByText.
function rowTypeSpans(text: string) {
  return screen.getAllByText(text, { selector: 'span' })
}

describe('EventList', () => {
  it('lists every event when unfiltered', () => {
    render(<EventList events={events} nodeOptions={['a', 'b']} />)
    expect(rowTypeSpans('WorkerStarted')).toHaveLength(2)
  })

  it('filters by node id', () => {
    render(<EventList events={events} nodeOptions={['a', 'b']} />)
    fireEvent.change(screen.getByLabelText('filter by node'), { target: { value: 'b' } })
    expect(rowTypeSpans('WorkerStarted')).toHaveLength(1)
    expect(screen.queryByText('WorkerFinished', { selector: 'span' })).not.toBeInTheDocument()
  })

  it('filters by event type', () => {
    render(<EventList events={events} nodeOptions={['a', 'b']} />)
    fireEvent.change(screen.getByLabelText('filter by event type'), { target: { value: 'WorkerFinished' } })
    expect(rowTypeSpans('WorkerFinished')).toHaveLength(1)
    expect(screen.queryByText('ExecutionStarted', { selector: 'span' })).not.toBeInTheDocument()
  })

  it('expands a row to show its raw payload on click', () => {
    render(<EventList events={events} nodeOptions={['a', 'b']} />)
    expect(screen.queryByText(/"costUsd"/)).not.toBeInTheDocument()
    fireEvent.click(rowTypeSpans('WorkerFinished')[0])
    expect(screen.getByText(/"costUsd": 0.01/)).toBeInTheDocument()
  })

  it('hides filter controls and ignores the node filter when fixedNodeId is set', () => {
    render(<EventList events={events} fixedNodeId="a" />)
    expect(screen.queryByLabelText('filter by node')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('filter by event type')).not.toBeInTheDocument()
    expect(rowTypeSpans('WorkerStarted')).toHaveLength(1)
    expect(rowTypeSpans('WorkerFinished')).toHaveLength(1)
  })

  it('shows a placeholder when nothing matches', () => {
    render(<EventList events={[]} />)
    expect(screen.getByText('no events')).toBeInTheDocument()
  })
})

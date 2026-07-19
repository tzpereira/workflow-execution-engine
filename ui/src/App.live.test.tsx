import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import App from './App'
import { emptyLive, reduceAll, type WFEvent } from './core/live'
import { useLive } from './liveStore'
import { useWorkspace } from './store'

const wf = `id: demo
version: 1.0.0
nodes:
  - id: a
    worker: wa@1.0.0
  - id: b
    tool:
      toolName: terminal
      input:
        command: echo
edges:
  - from: a
    to: b
budget:
  maxCostUsd: 1
  maxTokens: 100
  maxDurationMs: 1000
  maxRetriesPerNode: 0
`

const execId = 'demo-20260718T000000-aaaa'

function evt(partial: Partial<WFEvent> & Pick<WFEvent, 'type'>): WFEvent {
  return { executionId: execId, timestamp: '2026-07-18T00:00:00.000Z', prevHash: 'x', ...partial }
}

// A full, realistic run: a (Worker, fresh) then b (Tool), exactly the event
// sequence core/engine emits (core/engine/node.go) — proves the reducer's
// output renders correctly end to end (transport is unit-tested separately in
// liveClient.test.ts; this closes the loop from event to pixel).
const fullRun: WFEvent[] = [
  evt({ type: 'ExecutionStarted', payload: { workflow: 'demo', version: '1.0.0' } }),
  evt({ type: 'WorkerStarted', nodeId: 'a' }),
  evt({ type: 'CacheMiss', nodeId: 'a', payload: { key: 'k' } }),
  evt({ type: 'ArtifactCreated', nodeId: 'a', payload: { hash: 'h1', type: 'json' } }),
  evt({ type: 'WorkerFinished', nodeId: 'a', payload: { costUsd: 0.02, tokens: 10 } }),
  evt({ type: 'WorkerStarted', nodeId: 'b' }),
  evt({ type: 'ToolCalled', nodeId: 'b', payload: { tool: 'terminal' } }),
  evt({ type: 'ToolResult', nodeId: 'b', payload: { tool: 'terminal' } }),
  evt({ type: 'ArtifactCreated', nodeId: 'b', payload: { hash: 'h2', type: 'test-result' } }),
  evt({ type: 'WorkerFinished', nodeId: 'b', payload: { costUsd: 0, tokens: 0 } }),
  evt({ type: 'ExecutionFinished', payload: { state: 'succeeded' } }),
]

function resetWorkspace() {
  useWorkspace.setState({
    meta: { id: 'untitled', version: '0.1.0', budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 } },
    nodes: [],
    edges: [],
    selectedNodeId: null,
    fileName: null,
    error: null,
  })
}

function resetLive() {
  useLive.getState().disconnect()
  useLive.setState({ live: emptyLive(), error: null })
}

describe('live execution renders end to end', () => {
  beforeEach(() => {
    resetWorkspace()
    resetLive()
    useWorkspace.getState().importText(wf, 'yaml')
  })

  it('shows no live status while idle', () => {
    render(<App />)
    expect(screen.queryByText('running')).not.toBeInTheDocument()
    expect(screen.queryByText('done')).not.toBeInTheDocument()
  })

  it('renders node status, running cost, artifacts, and logs from a folded run', () => {
    render(<App />)

    act(() => {
      const live = reduceAll(fullRun, ['a', 'b'])
      useLive.setState({ live, connected: false })
    })

    // Both nodes succeeded (neither was a cache hit) — WorkflowNode badges.
    expect(screen.getAllByText('done')).toHaveLength(2)

    // The running-cost ticker in the Timeline header.
    expect(screen.getByText('$0.0200')).toBeInTheDocument()
    expect(screen.getByText('10 tok')).toBeInTheDocument()
    expect(screen.getByText('succeeded')).toBeInTheDocument()

    // Artifacts tab fills in real time as ArtifactCreated events arrive.
    fireEvent.click(screen.getByRole('button', { name: 'artifacts' }))
    expect(screen.getByText('json')).toBeInTheDocument()
    expect(screen.getByText('test-result')).toBeInTheDocument()

    // Logs tab shows the raw event stream (also the type-filter <select>'s own
    // options, hence getAllByText — the log row itself is a <span>).
    fireEvent.click(screen.getByRole('button', { name: 'logs' }))
    expect(screen.getAllByText('ExecutionFinished').some((el) => el.tagName === 'SPAN')).toBe(true)
  })

  it('marks a cache-hit node distinctly from a fresh success', () => {
    render(<App />)

    act(() => {
      const events: WFEvent[] = [
        evt({ type: 'ExecutionStarted', payload: { workflow: 'demo', version: '1.0.0' } }),
        evt({ type: 'WorkerStarted', nodeId: 'a' }),
        evt({ type: 'CacheHit', nodeId: 'a', payload: { key: 'k', savedCostUsd: 0.05, savedTokens: 100 } }),
        evt({ type: 'ArtifactCreated', nodeId: 'a', payload: { hash: 'h1', type: 'json' } }),
        evt({ type: 'WorkerFinished', nodeId: 'a', payload: { costUsd: 0, tokens: 0 } }),
      ]
      useLive.setState({ live: reduceAll(events, ['a', 'b']), connected: true })
    })

    expect(screen.getByText('cache hit')).toBeInTheDocument()
    expect(screen.getByText('saved $0.0500')).toBeInTheDocument()
  })
})

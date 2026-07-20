import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Audit } from '../core/audit'
import { MetricsPanel } from './MetricsPanel'

const audit: Audit = {
  executionId: 'exec-1',
  workflow: {
    id: 'wf',
    version: '1.0.0',
    nodes: [{ id: 'review', worker: 'reviewer@1.0.0' }],
    edges: [],
    budget: {
      maxCostUsd: 0,
      maxTokens: 0,
      maxDurationMs: 0,
      maxRetriesPerNode: 0,
    },
  },
  budget: {
    maxCostUsd: 0,
    maxTokens: 0,
    maxDurationMs: 0,
    maxRetriesPerNode: 0,
  },
  events: [
    {
      type: 'ExecutionStarted',
      timestamp: '2026-01-01T00:00:00.000Z',
      executionId: 'exec-1',
      prevHash: '',
    },
    {
      type: 'WorkerStarted',
      timestamp: '2026-01-01T00:00:00.000Z',
      executionId: 'exec-1',
      nodeId: 'review',
      prevHash: '',
    },
    {
      type: 'WorkerFinished',
      timestamp: '2026-01-01T00:00:02.000Z',
      executionId: 'exec-1',
      nodeId: 'review',
      prevHash: '',
    },
    {
      type: 'ExecutionFinished',
      timestamp: '2026-01-01T00:00:02.000Z',
      executionId: 'exec-1',
      prevHash: '',
    },
  ],
  nodes: {
    review: {
      state: 'succeeded',
      hash: 'h1',
      type: 'json',
      costUsd: 0.02,
      tokens: 500,
    },
  },
  spentCostUsd: 0.02,
  spentTokens: 500,
  state: 'succeeded',
}

describe('MetricsPanel', () => {
  it('shows a placeholder before any execution has loaded', () => {
    render(<MetricsPanel audit={null} />)
    expect(
      screen.getByText('Metrics appear here once a run streams in.'),
    ).toBeInTheDocument()
  })

  it('renders the execution rollup and the per-node breakdown', () => {
    render(<MetricsPanel audit={audit} />)
    // Cost also appears on the chart bar; tokens/duration appear in rollup and table.
    expect(screen.getAllByText('$0.0200')).toHaveLength(3)
    expect(screen.getAllByText('500')).toHaveLength(2)
    expect(screen.getAllByText('2.0s')).toHaveLength(2)
    expect(screen.getAllByText('review')).toHaveLength(2)
    expect(screen.getByText('succeeded')).toBeInTheDocument()
    expect(
      screen.getByLabelText('Cost and token usage by node'),
    ).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Audit } from '../core/audit'
import { emptyLive } from '../core/live'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { Inspector } from './Inspector'

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

const workflow = {
  id: 'demo',
  version: '1.0.0',
  nodes: [{ id: 'review', worker: 'reviewer@1.0.0' }],
  edges: [],
  budget: { maxCostUsd: 1, maxTokens: 100, maxDurationMs: 1000, maxRetriesPerNode: 2 },
}

const audit: Audit = {
  executionId: 'demo-20260719T000000-aaaa',
  workflow,
  budget: workflow.budget,
  events: [
    {
      type: 'WorkerFinished',
      timestamp: '2026-07-19T00:00:02.000Z',
      executionId: 'demo-20260719T000000-aaaa',
      nodeId: 'review',
      prevHash: 'x',
      payload: { costUsd: 0.02, tokens: 10, contextHashes: ['h-diff'] },
    },
  ],
  nodes: {
    review: { state: 'succeeded', hash: 'h-review', type: 'json', content: b64('{"verdict":"approve","score":95,"issues":[]}'), costUsd: 0.02, tokens: 10 },
    diff: { state: 'succeeded', hash: 'h-diff', type: 'diff', content: b64('') },
  },
  spentCostUsd: 0.02,
  spentTokens: 10,
  state: 'succeeded',
  workers: {
    'reviewer@1.0.0': {
      id: 'reviewer',
      version: '1.0.0',
      objective: 'Review a unified diff and report a bounded, structured verdict.',
      constraints: ['Judge only what the diff shows.'],
      tools: [],
      contextPolicy: { mode: 'diff-only' },
      contract: {
        goal: 'Produce a structured review verdict for the diff.',
        rules: ['Return at most five issues.'],
        outputSchema: { type: 'object', properties: { verdict: { enum: ['approve', 'request-changes'] } } },
        successCriteria: ['No critical defect is left unreported.'],
        maxRetries: 2,
      },
      model: { provider: 'openai', model: 'gpt-4o-mini' },
    },
  },
}

// diff/review nodes both have hash 'h-diff'/'h-review' — nodeIdForHash resolves
// the reviewer's admitted context hash ('h-diff') back to the 'diff' node id.
// The 'diff' node isn't itself a workflow node here (it stands in for an
// upstream artifact this test only needs by hash), which is fine: Inspector
// only looks it up via audit.nodes, never via workflow.nodes.

function selectReviewNode() {
  useWorkspace.setState({
    meta: { id: 'demo', version: '1.0.0', budget: workflow.budget },
    nodes: [{ id: 'review', position: { x: 0, y: 0 }, data: { node: workflow.nodes[0] } }],
    edges: [],
    selectedNodeId: 'review',
    fileName: 'demo.yaml',
    error: null,
  })
}

describe('Inspector', () => {
  beforeEach(() => {
    useWorkspace.setState({
      meta: { id: 'untitled', version: '0.1.0', budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 } },
      nodes: [],
      edges: [],
      selectedNodeId: null,
      fileName: null,
      error: null,
    })
    useLive.setState({ live: emptyLive(), audit: null, connected: false, error: null })
  })

  it('shows workflow metadata and the Budget form when no node is selected', () => {
    render(<Inspector />)
    expect(screen.getByText('Workflow')).toBeInTheDocument()
  })

  it("shows the run's resolved Inputs (REQ-INPUT-01) when the loaded audit has any", () => {
    useLive.setState({ audit: { ...audit, inputs: { prUrl: 'https://example.com/42' } } })
    render(<Inspector />)
    expect(screen.getByText('Inputs (this run)')).toBeInTheDocument()
    expect(screen.getByText('prUrl')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/42')).toBeInTheDocument()
  })

  it('omits the Inputs section when the audit has none', () => {
    render(<Inspector />)
    expect(screen.queryByText('Inputs (this run)')).not.toBeInTheDocument()
  })

  it("answers \"what did this Worker see, and what did it produce\" in one click (REQ-UI-03/04)", () => {
    selectReviewNode()
    useLive.setState((s) => ({ live: { ...s.live, nodes: { review: { id: 'review', status: 'succeeded', costUsd: 0.02, tokens: 10, cached: false, retries: 0, startedAt: 1000, endedAt: 3000 } } }, audit }))

    render(<Inspector />)

    // Goal (Worker.objective).
    expect(screen.getByText(/Review a unified diff and report a bounded/)).toBeInTheDocument()
    // Contract, rendered with its schema.
    expect(screen.getByText('Produce a structured review verdict for the diff.')).toBeInTheDocument()
    expect(screen.getByText('Return at most five issues.')).toBeInTheDocument()
    expect(screen.getByText(/"verdict"/)).toBeInTheDocument()
    // Validation result: succeeded, no ContractViolation events recorded.
    expect(screen.getByText('valid — no contract violations')).toBeInTheDocument()
    // Resolved context: the admitted hash resolves back to the 'diff' node.
    expect(screen.getByText('diff')).toBeInTheDocument()
    // Cost/tokens/duration.
    expect(screen.getByText('$0.0200')).toBeInTheDocument()
    expect(screen.getByText('10 tok')).toBeInTheDocument()
    expect(screen.getByText('2.0s')).toBeInTheDocument()
    // Artifact viewer renders the node's own JSON output.
    expect(screen.getByText('verdict:')).toBeInTheDocument()
    // The node's own event history.
    expect(screen.getByText('WorkerFinished')).toBeInTheDocument()
  })

  it('shows a contract-violation summary when the node retried', () => {
    selectReviewNode()
    useLive.setState((s) => ({
      live: { ...s.live, nodes: { review: { id: 'review', status: 'succeeded', costUsd: 0.02, tokens: 10, cached: false, retries: 1 } } },
      audit: {
        ...audit,
        events: [
          { type: 'ContractViolation', timestamp: 't', executionId: 'x', nodeId: 'review', prevHash: '', payload: { error: 'missing field verdict' } },
          ...audit.events,
        ],
      },
    }))

    render(<Inspector />)
    expect(screen.getByText('1 contract violation, retried')).toBeInTheDocument()
  })
})

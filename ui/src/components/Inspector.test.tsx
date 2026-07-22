import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Audit } from '../core/audit'
import { emptyLive } from '../core/live'
import * as liveClient from '../liveClient'
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
  budget: {
    maxCostUsd: 1,
    maxTokens: 100,
    maxDurationMs: 1000,
    maxRetriesPerNode: 2,
  },
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
    review: {
      state: 'succeeded',
      hash: 'h-review',
      type: 'json',
      content: b64('{"verdict":"approve","score":95,"issues":[]}'),
      costUsd: 0.02,
      tokens: 10,
    },
    diff: {
      state: 'succeeded',
      hash: 'h-diff',
      type: 'diff',
      content: b64(''),
    },
  },
  spentCostUsd: 0.02,
  spentTokens: 10,
  state: 'succeeded',
  workers: {
    'reviewer@1.0.0': {
      id: 'reviewer',
      version: '1.0.0',
      objective:
        'Review a unified diff and report a bounded, structured verdict.',
      constraints: ['Judge only what the diff shows.'],
      tools: [],
      contextPolicy: { mode: 'diff-only' },
      contract: {
        goal: 'Produce a structured review verdict for the diff.',
        rules: ['Return at most five issues.'],
        outputSchema: {
          type: 'object',
          properties: { verdict: { enum: ['approve', 'request-changes'] } },
        },
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
    nodes: [
      {
        id: 'review',
        position: { x: 0, y: 0 },
        data: { node: workflow.nodes[0] },
      },
    ],
    edges: [],
    selectedNodeId: 'review',
    fileName: 'demo.yaml',
    error: null,
  })
}

describe('Inspector', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // WorkerEditor (M1.14c) fetches a node's Worker independently of the
    // audit response (so editing works before any run) — mock it to return
    // the same Worker this file's `audit.workers` fixture already carries.
    vi.spyOn(liveClient, 'fetchWorkerVersions').mockResolvedValue([
      audit.workers!['reviewer@1.0.0'],
    ])
    useWorkspace.setState({
      meta: {
        id: 'untitled',
        version: '0.1.0',
        budget: {
          maxCostUsd: 0,
          maxTokens: 0,
          maxDurationMs: 0,
          maxRetriesPerNode: 0,
        },
      },
      nodes: [],
      edges: [],
      selectedNodeId: null,
      fileName: null,
      error: null,
      history: [],
    })
    useLive.setState({
      live: emptyLive(),
      audit: null,
      connected: false,
      error: null,
    })
  })

  it('shows workflow metadata and the Budget form when no node is selected', () => {
    render(<Inspector />)
    expect(screen.getByText('Workflow')).toBeInTheDocument()
  })

  it('edits a manually created node definition in place', () => {
    useWorkspace.getState().addNode({ id: 'manual', worker: 'manual@1.0.0' })
    render(<Inspector />)

    const idInput = screen.getByLabelText('Node id')
    fireEvent.change(idInput, { target: { value: 'analysis' } })
    fireEvent.blur(idInput)
    expect(useWorkspace.getState().nodes[0].id).toBe('analysis')

    fireEvent.change(screen.getByLabelText('Worker ref'), {
      target: { value: 'analysis-worker@1.0.0' },
    })
    expect(useWorkspace.getState().workflow().nodes[0].worker).toBe(
      'analysis-worker@1.0.0',
    )

    fireEvent.change(screen.getByLabelText('Node type'), {
      target: { value: 'tool' },
    })
    fireEvent.change(screen.getByLabelText('Tool name'), {
      target: { value: 'shell' },
    })
    const input = screen.getByLabelText('Tool input JSON')
    fireEvent.change(input, { target: { value: '{ "command": "pwd" }' } })
    fireEvent.blur(input)

    expect(useWorkspace.getState().workflow().nodes[0]).toEqual({
      id: 'analysis',
      tool: { toolName: 'shell', input: { command: 'pwd' } },
    })
  })

  it("shows the run's resolved Inputs (REQ-INPUT-01) when the loaded audit has any", () => {
    useLive.setState({
      audit: { ...audit, inputs: { prUrl: 'https://example.com/42' } },
    })
    render(<Inspector />)
    expect(screen.getByText('Inputs (this run)')).toBeInTheDocument()
    expect(screen.getByText('prUrl')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/42')).toBeInTheDocument()
  })

  it('omits the Inputs section when the audit has none', () => {
    render(<Inspector />)
    expect(screen.queryByText('Inputs (this run)')).not.toBeInTheDocument()
  })

  it('answers "what did this Worker see, and what did it produce" in one click (REQ-UI-03/04)', async () => {
    selectReviewNode()
    useLive.setState((s) => ({
      live: {
        ...s.live,
        nodes: {
          review: {
            id: 'review',
            status: 'succeeded',
            costUsd: 0.02,
            tokens: 10,
            cached: false,
            retries: 0,
            startedAt: 1000,
            endedAt: 3000,
          },
        },
      },
      audit,
    }))

    render(<Inspector />)

    // Goal (Worker.objective) and Contract are now an editable WorkerEditor
    // (M1.14c) — its fields are populated once the (mocked) fetch resolves.
    await waitFor(() =>
      expect(
        screen.getByDisplayValue(/Review a unified diff and report a bounded/),
      ).toBeInTheDocument(),
    )
    expect(
      screen.getByDisplayValue(
        'Produce a structured review verdict for the diff.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByDisplayValue('Return at most five issues.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/"verdict"/)).toBeInTheDocument()
    // Validation result: succeeded, no ContractViolation events recorded.
    expect(
      screen.getByText('valid — no contract violations'),
    ).toBeInTheDocument()
    // Resolved context: the admitted hash resolves back to the 'diff' node.
    expect(screen.getByText('diff')).toBeInTheDocument()
    // Cost/tokens/duration.
    expect(screen.getByText('$0.0200')).toBeInTheDocument()
    expect(screen.getByText('10 tok')).toBeInTheDocument()
    expect(screen.getByText('2.0s')).toBeInTheDocument()
    // Artifact viewer presents the review semantically, not as raw JSON.
    expect(screen.getByText('approve')).toBeInTheDocument()
    expect(screen.getByText('95/100')).toBeInTheDocument()
    expect(screen.getByText('No actionable findings.')).toBeInTheDocument()
    expect(screen.queryByText('verdict:')).not.toBeInTheDocument()
    // The node's own event history.
    expect(screen.getByText('WorkerFinished')).toBeInTheDocument()
    // Context Policy editor (M1.14c): this node has no override, so it shows
    // the Worker's own default (diff-only) read-only rather than presenting
    // a misleading "parent-only" as if it were an active override.
    expect(screen.getByText('diff-only')).toBeInTheDocument()
    expect(
      screen.queryByLabelText('Context policy mode'),
    ).not.toBeInTheDocument()
  })

  it('shows a contract-violation summary when the node retried', () => {
    selectReviewNode()
    useLive.setState((s) => ({
      live: {
        ...s.live,
        nodes: {
          review: {
            id: 'review',
            status: 'succeeded',
            costUsd: 0.02,
            tokens: 10,
            cached: false,
            retries: 1,
          },
        },
      },
      audit: {
        ...audit,
        events: [
          {
            type: 'ContractViolation',
            timestamp: 't',
            executionId: 'x',
            nodeId: 'review',
            prevHash: '',
            payload: { error: 'missing field verdict' },
          },
          ...audit.events,
        ],
      },
    }))

    render(<Inspector />)
    expect(
      screen.getByText('1 contract violation, retried'),
    ).toBeInTheDocument()
  })
})

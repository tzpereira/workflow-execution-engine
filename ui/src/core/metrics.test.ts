import { describe, expect, it } from 'vitest'

import type { Audit } from './audit'
import { computeMetrics } from './metrics'

function baseAudit(overrides: Partial<Audit> = {}): Audit {
  return {
    executionId: 'exec-1',
    workflow: {
      id: 'wf',
      version: '1.0.0',
      nodes: [
        { id: 'review', worker: 'reviewer@1.0.0' },
        { id: 'fix', worker: 'fixer@1.0.0' },
      ],
      edges: [],
      budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 },
    },
    budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 },
    events: [],
    nodes: {},
    spentCostUsd: 0,
    spentTokens: 0,
    state: 'succeeded',
    ...overrides,
  }
}

describe('computeMetrics', () => {
  it('sums cost/tokens from the audit and computes total duration', () => {
    const audit = baseAudit({
      spentCostUsd: 0.05,
      spentTokens: 200,
      events: [
        { type: 'ExecutionStarted', timestamp: '2026-01-01T00:00:00.000Z', executionId: 'exec-1', prevHash: '' },
        { type: 'ExecutionFinished', timestamp: '2026-01-01T00:00:04.000Z', executionId: 'exec-1', prevHash: '' },
      ],
    })
    const m = computeMetrics(audit)
    expect(m.totalCostUsd).toBe(0.05)
    expect(m.totalTokens).toBe(200)
    expect(m.durationMs).toBe(4000)
  })

  it('counts cache hits/misses and computes hit rate, plus savings from CacheHit payloads', () => {
    const audit = baseAudit({
      events: [
        { type: 'CacheMiss', timestamp: 't', executionId: 'exec-1', nodeId: 'review', prevHash: '' },
        { type: 'CacheHit', timestamp: 't', executionId: 'exec-1', nodeId: 'fix', prevHash: '', payload: { savedCostUsd: 0.01, savedTokens: 40 } },
      ],
    })
    const m = computeMetrics(audit)
    expect(m.cacheHits).toBe(1)
    expect(m.cacheMisses).toBe(1)
    expect(m.cacheHitRate).toBe(0.5)
    expect(m.savedCostUsd).toBe(0.01)
    expect(m.savedTokens).toBe(40)
  })

  it('is NaN-safe: hit rate is 0 when no cache decision has been recorded yet', () => {
    expect(computeMetrics(baseAudit()).cacheHitRate).toBe(0)
  })

  it('aggregates retries, contract violations, and failures per node into execution totals', () => {
    const audit = baseAudit({
      nodes: {
        review: { state: 'succeeded', hash: 'h1', costUsd: 0.01, tokens: 50 },
        fix: { state: 'failed', hash: '', costUsd: 0, tokens: 0 },
      },
      events: [
        { type: 'Retry', timestamp: 't', executionId: 'exec-1', nodeId: 'review', prevHash: '', payload: { attempt: 1 } },
        { type: 'ContractViolation', timestamp: 't', executionId: 'exec-1', nodeId: 'review', prevHash: '', payload: { error: 'bad' } },
        { type: 'Failure', timestamp: 't', executionId: 'exec-1', nodeId: 'fix', prevHash: '', payload: { error: 'boom' } },
      ],
    })
    const m = computeMetrics(audit)
    expect(m.retries).toBe(1)
    expect(m.contractViolations).toBe(1)
    expect(m.failures).toBe(1)

    const review = m.nodes.find((n) => n.nodeId === 'review')!
    expect(review.retries).toBe(1)
    expect(review.firstPassAccepted).toBe(false) // it violated once, so not first-pass

    const fix = m.nodes.find((n) => n.nodeId === 'fix')!
    expect(fix.state).toBe('failed')
    expect(fix.firstPassAccepted).toBe(false)
  })

  it('marks a node first-pass-accepted only when it succeeded with zero contract violations', () => {
    const audit = baseAudit({
      nodes: { review: { state: 'succeeded', hash: 'h1', costUsd: 0.01, tokens: 50 } },
    })
    expect(computeMetrics(audit).nodes[0].firstPassAccepted).toBe(true)
  })

  it('counts downstream consumers: how many other nodes admitted this node\'s artifact as context (REQ-METRIC-02)', () => {
    const audit = baseAudit({
      nodes: {
        review: { state: 'succeeded', hash: 'diff-hash', costUsd: 0.01, tokens: 50 },
        fix: { state: 'succeeded', hash: 'fix-hash', costUsd: 0.02, tokens: 80 },
      },
      events: [
        { type: 'WorkerFinished', timestamp: 't', executionId: 'exec-1', nodeId: 'fix', prevHash: '', payload: { contextHashes: ['diff-hash'] } },
      ],
    })
    const m = computeMetrics(audit)
    expect(m.nodes.find((n) => n.nodeId === 'review')!.downstreamConsumers).toBe(1)
    expect(m.nodes.find((n) => n.nodeId === 'fix')!.downstreamConsumers).toBe(0)
  })

  it('computes per-node duration from WorkerStarted to WorkerFinished/Failure', () => {
    const audit = baseAudit({
      nodes: { review: { state: 'succeeded', hash: 'h1', costUsd: 0.01, tokens: 50 } },
      events: [
        { type: 'WorkerStarted', timestamp: '2026-01-01T00:00:00.000Z', executionId: 'exec-1', nodeId: 'review', prevHash: '' },
        { type: 'WorkerFinished', timestamp: '2026-01-01T00:00:02.500Z', executionId: 'exec-1', nodeId: 'review', prevHash: '' },
      ],
    })
    expect(computeMetrics(audit).nodes[0].durationMs).toBe(2500)
  })

  it('marks a node cached when a CacheHit event was recorded for it', () => {
    const audit = baseAudit({
      nodes: { review: { state: 'succeeded', hash: 'h1', costUsd: 0, tokens: 0 } },
      events: [{ type: 'CacheHit', timestamp: 't', executionId: 'exec-1', nodeId: 'review', prevHash: '', payload: { savedCostUsd: 0.01, savedTokens: 10 } }],
    })
    expect(computeMetrics(audit).nodes[0].cached).toBe(true)
  })
})

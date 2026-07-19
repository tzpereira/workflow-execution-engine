// Derives the Metrics panel's numbers (REQ-METRIC-01/02, local REQ-METRIC-03)
// purely from an Audit — no second instrumentation path, no dependency on the
// live store's own event fold (core/live.ts): everything here is computable
// from the same event log a past, cache-loaded, or in-flight execution's
// Audit response already carries (PRIN-02). Kept as plain functions over data
// so they're unit-testable without a server or a React tree.
//
// Scope disclosed up front: REQ-METRIC-03's cache-hit savings (savedCostUsd/
// savedTokens, already recorded per CacheHit event since M1.12) are surfaced
// here; its other two categories — context-pruning savings vs. a "full
// history" baseline, and retry-avoidance savings vs. a re-inflated-context
// baseline — need a counterfactual cost model (what a call *would* have cost
// under a different policy) that doesn't exist anywhere in the engine yet.
// Inventing that model wasn't part of any milestone's task list, so it's left
// out rather than guessed at.

import type { Audit, NodeRecordState } from './audit'
import { contextHashesFor } from './audit'
import type { WFEvent } from './live'

export interface NodeMetrics {
  nodeId: string
  state: NodeRecordState
  costUsd: number
  tokens: number
  durationMs?: number
  cached: boolean
  retries: number
  contractViolations: number
  // REQ-METRIC-02 — artifact value proxies.
  firstPassAccepted: boolean
  downstreamConsumers: number
}

export interface ExecutionMetrics {
  totalCostUsd: number
  totalTokens: number
  durationMs?: number
  cacheHits: number
  cacheMisses: number
  /** 0 when no node has resolved a cache decision yet (never NaN). */
  cacheHitRate: number
  retries: number
  contractViolations: number
  failures: number
  savedCostUsd: number
  savedTokens: number
  nodes: NodeMetrics[]
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

function eventsFor(events: WFEvent[], nodeId: string): WFEvent[] {
  return events.filter((e) => e.nodeId === nodeId)
}

export function computeMetrics(audit: Audit): ExecutionMetrics {
  const { events } = audit

  let startedAt: number | undefined
  let finishedAt: number | undefined
  let cacheHits = 0
  let cacheMisses = 0
  let savedCostUsd = 0
  let savedTokens = 0
  for (const ev of events) {
    const t = Date.parse(ev.timestamp)
    if (ev.type === 'ExecutionStarted') startedAt = Number.isNaN(t) ? undefined : t
    if (ev.type === 'ExecutionFinished') finishedAt = Number.isNaN(t) ? undefined : t
    if (ev.type === 'CacheHit') {
      cacheHits++
      savedCostUsd += num(ev.payload?.savedCostUsd)
      savedTokens += num(ev.payload?.savedTokens)
    }
    if (ev.type === 'CacheMiss') cacheMisses++
  }

  const nodeIds = Object.keys(audit.nodes)
  const nodes: NodeMetrics[] = nodeIds.map((nodeId) => {
    const rec = audit.nodes[nodeId]
    const nodeEvents = eventsFor(events, nodeId)
    const started = nodeEvents.find((e) => e.type === 'WorkerStarted')
    const ended = nodeEvents.find((e) => e.type === 'WorkerFinished' || e.type === 'Failure')
    const startMs = started ? Date.parse(started.timestamp) : NaN
    const endMs = ended ? Date.parse(ended.timestamp) : NaN
    const retries = nodeEvents.filter((e) => e.type === 'Retry').length
    const contractViolations = nodeEvents.filter((e) => e.type === 'ContractViolation').length
    const cached = nodeEvents.some((e) => e.type === 'CacheHit')

    // REQ-METRIC-02: how many other nodes' resolved context admitted this
    // node's own artifact hash — an artifact nobody consumed downstream is
    // cost without value (PRIN-08).
    const downstreamConsumers = rec.hash
      ? nodeIds.filter((otherId) => otherId !== nodeId && contextHashesFor(audit, otherId).includes(rec.hash!)).length
      : 0

    return {
      nodeId,
      state: rec.state,
      costUsd: num(rec.costUsd),
      tokens: num(rec.tokens),
      durationMs: !Number.isNaN(startMs) && !Number.isNaN(endMs) ? endMs - startMs : undefined,
      cached,
      retries,
      contractViolations,
      firstPassAccepted: rec.state === 'succeeded' && contractViolations === 0,
      downstreamConsumers,
    }
  })

  return {
    totalCostUsd: audit.spentCostUsd,
    totalTokens: audit.spentTokens,
    durationMs: startedAt != null && finishedAt != null ? finishedAt - startedAt : undefined,
    cacheHits,
    cacheMisses,
    cacheHitRate: cacheHits + cacheMisses > 0 ? cacheHits / (cacheHits + cacheMisses) : 0,
    retries: nodes.reduce((n, x) => n + x.retries, 0),
    contractViolations: nodes.reduce((n, x) => n + x.contractViolations, 0),
    failures: nodes.filter((n) => n.state === 'failed').length,
    savedCostUsd,
    savedTokens,
    nodes,
  }
}

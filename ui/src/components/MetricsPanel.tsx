import type { Audit } from '../core/audit'
import { computeMetrics } from '../core/metrics'

function fmtMs(ms: number | undefined): string {
  if (ms == null) return '—'
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

// MetricsPanel is the Timeline area's Metrics tab (REQ-UI-05, REQ-METRIC-01/02):
// the execution-level rollup plus a per-node breakdown, everything derived
// from the Audit response alone (core/metrics.ts) — no separate
// instrumentation, no second source of truth (PRIN-02).
export function MetricsPanel({ audit }: { audit: Audit | null }) {
  if (!audit) {
    return (
      <p className="text-neutral-400">
        Metrics appear here once a run streams in.
      </p>
    )
  }
  const m = computeMetrics(audit)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 font-mono text-xs">
        <Stat label="cost" value={`$${m.totalCostUsd.toFixed(4)}`} />
        <Stat label="tokens" value={String(m.totalTokens)} />
        <Stat label="duration" value={fmtMs(m.durationMs)} />
        <Stat
          label="cache hit rate"
          value={`${Math.round(m.cacheHitRate * 100)}%`}
        />
        <Stat label="retries" value={String(m.retries)} />
        <Stat
          label="contract violations"
          value={String(m.contractViolations)}
        />
        <Stat label="failures" value={String(m.failures)} />
        <Stat
          label="saved (cache)"
          value={`$${m.savedCostUsd.toFixed(4)}`}
          highlight={m.savedCostUsd > 0}
        />
      </div>

      <NodeUsageChart nodes={m.nodes} />
      <ExecutionHealthChart metrics={m} />
      <ReplayComparison metrics={m} />

      <table className="w-full border-collapse text-left font-mono text-[11px]">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-500">
            <th className="py-1 pr-2 font-medium">node</th>
            <th className="py-1 pr-2 font-medium">state</th>
            <th className="py-1 pr-2 font-medium">cost</th>
            <th className="py-1 pr-2 font-medium">tokens</th>
            <th className="py-1 pr-2 font-medium">duration</th>
            <th className="py-1 pr-2 font-medium">retries</th>
            <th className="py-1 pr-2 font-medium">violations</th>
            <th className="py-1 pr-2 font-medium">1st-pass</th>
            <th className="py-1 font-medium">consumers</th>
          </tr>
        </thead>
        <tbody>
          {m.nodes.map((n) => (
            <tr
              key={n.nodeId}
              className="border-b border-neutral-100 text-neutral-700"
            >
              <td className="py-1 pr-2 text-neutral-900">
                {n.nodeId}
                {n.cached && (
                  <span className="ml-1 rounded bg-amber-100 px-1 text-amber-700">
                    cached
                  </span>
                )}
              </td>
              <td className="py-1 pr-2">{n.state}</td>
              <td className="py-1 pr-2">${n.costUsd.toFixed(4)}</td>
              <td className="py-1 pr-2">{n.tokens}</td>
              <td className="py-1 pr-2">{fmtMs(n.durationMs)}</td>
              <td className="py-1 pr-2">{n.retries}</td>
              <td className="py-1 pr-2">{n.contractViolations}</td>
              <td className="py-1 pr-2">{n.firstPassAccepted ? 'yes' : '—'}</td>
              <td className="py-1">{n.downstreamConsumers}</td>
            </tr>
          ))}
          {m.nodes.length === 0 && (
            <tr>
              <td colSpan={9} className="py-2 text-neutral-400">
                no nodes recorded yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ExecutionHealthChart({
  metrics,
}: {
  metrics: ReturnType<typeof computeMetrics>
}) {
  const decisions = metrics.cacheHits + metrics.cacheMisses
  const rows = [
    {
      label: 'cache hits',
      value: metrics.cacheHits,
      max: Math.max(decisions, 1),
      tone: 'bg-amber-500',
      detail: `${Math.round(metrics.cacheHitRate * 100)}% hit rate`,
    },
    {
      label: 'cache misses',
      value: metrics.cacheMisses,
      max: Math.max(decisions, 1),
      tone: 'bg-neutral-400',
      detail: `${metrics.cacheMisses} fresh`,
    },
    {
      label: 'retries',
      value: metrics.retries,
      max: Math.max(
        metrics.retries,
        metrics.contractViolations,
        metrics.failures,
        1,
      ),
      tone: 'bg-blue-500',
      detail: `${metrics.retries}`,
    },
    {
      label: 'violations',
      value: metrics.contractViolations,
      max: Math.max(
        metrics.retries,
        metrics.contractViolations,
        metrics.failures,
        1,
      ),
      tone: 'bg-orange-500',
      detail: `${metrics.contractViolations}`,
    },
    {
      label: 'failures',
      value: metrics.failures,
      max: Math.max(
        metrics.retries,
        metrics.contractViolations,
        metrics.failures,
        1,
      ),
      tone: 'bg-red-500',
      detail: `${metrics.failures}`,
    },
  ]
  return (
    <div aria-label="Execution health chart">
      <div className="mb-1 text-[10px] uppercase text-neutral-400">
        execution health
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[7rem_1fr_5rem] items-center gap-2"
          >
            <span className="text-[11px] text-neutral-600">{row.label}</span>
            <UsageBar
              value={row.value}
              max={row.max}
              tone={row.tone}
              label={`${row.value}`}
            />
            <span className="truncate font-mono text-[10px] text-neutral-500">
              {row.detail}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReplayComparison({
  metrics,
}: {
  metrics: ReturnType<typeof computeMetrics>
}) {
  const cached = metrics.nodes.filter((node) => node.cached).length
  const fresh = metrics.nodes.filter(
    (node) => !node.cached && node.state === 'succeeded',
  ).length
  const failed = metrics.nodes.filter((node) => node.state === 'failed').length
  const total = Math.max(metrics.nodes.length, 1)
  return (
    <div
      className="rounded border border-neutral-200 p-2"
      aria-label="Replay and cache comparison"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase text-neutral-500">
          replay/cache comparison
        </div>
        <div className="font-mono text-[10px] text-neutral-400">
          audit view, zero model calls
        </div>
      </div>
      <div className="flex h-3 overflow-hidden rounded bg-neutral-100">
        <div
          className="bg-amber-500"
          style={{ width: `${(cached / total) * 100}%` }}
          title={`${cached} cached`}
        />
        <div
          className="bg-emerald-500"
          style={{ width: `${(fresh / total) * 100}%` }}
          title={`${fresh} fresh successful`}
        />
        <div
          className="bg-red-500"
          style={{ width: `${(failed / total) * 100}%` }}
          title={`${failed} failed`}
        />
      </div>
      <div className="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-neutral-600">
        <span>{cached} cached</span>
        <span>{fresh} fresh</span>
        <span>{failed} failed</span>
        <span>${metrics.savedCostUsd.toFixed(4)} avoided</span>
        <span>{metrics.savedTokens} tok avoided</span>
      </div>
    </div>
  )
}

function NodeUsageChart({
  nodes,
}: {
  nodes: ReturnType<typeof computeMetrics>['nodes']
}) {
  if (nodes.length === 0) return null
  const maxTokens = Math.max(...nodes.map((node) => node.tokens), 1)
  const maxCost = Math.max(...nodes.map((node) => node.costUsd), 0.000001)
  return (
    <div aria-label="Cost and token usage by node">
      <div className="mb-1 grid grid-cols-[7rem_1fr_1fr] gap-2 text-[10px] uppercase text-neutral-400">
        <span>node</span>
        <span>tokens</span>
        <span>cost</span>
      </div>
      <div className="space-y-1.5">
        {nodes.map((node) => (
          <div
            key={node.nodeId}
            className="grid grid-cols-[7rem_1fr_1fr] items-center gap-2"
          >
            <span
              className="truncate font-mono text-[11px] text-neutral-700"
              title={node.nodeId}
            >
              {node.nodeId}
            </span>
            <UsageBar
              value={node.tokens}
              max={maxTokens}
              tone="bg-blue-500"
              label={`${node.tokens} tokens`}
            />
            <UsageBar
              value={node.costUsd}
              max={maxCost}
              tone="bg-emerald-500"
              label={`$${node.costUsd.toFixed(4)}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function UsageBar({
  value,
  max,
  tone,
  label,
}: {
  value: number
  max: number
  tone: string
  label: string
}) {
  const width = value <= 0 ? 0 : Math.max(2, (value / max) * 100)
  return (
    <div
      className="relative h-4 overflow-hidden rounded bg-neutral-100"
      title={label}
    >
      <div className={`h-full ${tone}`} style={{ width: `${width}%` }} />
      <span className="absolute inset-y-0 left-1 flex items-center font-mono text-[9px] text-neutral-700 mix-blend-multiply">
        {label}
      </span>
    </div>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-neutral-400">
        {label}
      </div>
      <div className={highlight ? 'text-amber-700' : 'text-neutral-900'}>
        {value}
      </div>
    </div>
  )
}

import type { NodeStatus, RunState } from './live'

export type SignalKey = NodeStatus | RunState | 'ready' | 'empty' | 'watching' | 'connected' | 'disconnected'

export interface Signal {
  label: string
  icon: string
  dotClass: string
  badgeClass: string
  borderClass: string
  barClass: string
  textClass: string
}

const baseBadge = 'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase'

export const signals: Record<SignalKey, Signal> = {
  pending: {
    label: 'pending',
    icon: '○',
    dotClass: 'bg-neutral-300',
    badgeClass: `${baseBadge} bg-neutral-100 text-neutral-600`,
    borderClass: 'border-neutral-300',
    barClass: 'bg-neutral-300',
    textClass: 'text-neutral-700',
  },
  running: {
    label: 'running',
    icon: '●',
    dotClass: 'bg-blue-500',
    badgeClass: `${baseBadge} bg-blue-100 text-blue-800`,
    borderClass: 'border-blue-500',
    barClass: 'bg-blue-500',
    textClass: 'text-blue-800',
  },
  succeeded: {
    label: 'succeeded',
    icon: '✓',
    dotClass: 'bg-emerald-500',
    badgeClass: `${baseBadge} bg-emerald-100 text-emerald-800`,
    borderClass: 'border-emerald-500',
    barClass: 'bg-emerald-500',
    textClass: 'text-emerald-800',
  },
  cached: {
    label: 'cache hit',
    icon: '◇',
    dotClass: 'bg-amber-500',
    badgeClass: `${baseBadge} bg-amber-100 text-amber-800`,
    borderClass: 'border-amber-500',
    barClass: 'bg-amber-500',
    textClass: 'text-amber-800',
  },
  failed: {
    label: 'failed',
    icon: '!',
    dotClass: 'bg-red-500',
    badgeClass: `${baseBadge} bg-red-100 text-red-800`,
    borderClass: 'border-red-500',
    barClass: 'bg-red-500',
    textClass: 'text-red-800',
  },
  idle: {
    label: 'idle',
    icon: '○',
    dotClass: 'bg-neutral-300',
    badgeClass: `${baseBadge} bg-neutral-100 text-neutral-600`,
    borderClass: 'border-neutral-300',
    barClass: 'bg-neutral-300',
    textClass: 'text-neutral-700',
  },
  cancelled: {
    label: 'cancelled',
    icon: '–',
    dotClass: 'bg-neutral-500',
    badgeClass: `${baseBadge} bg-neutral-100 text-neutral-700`,
    borderClass: 'border-neutral-500',
    barClass: 'bg-neutral-500',
    textClass: 'text-neutral-800',
  },
  ready: {
    label: 'ready',
    icon: '→',
    dotClass: 'bg-amber-500',
    badgeClass: `${baseBadge} bg-amber-100 text-amber-800`,
    borderClass: 'border-amber-500',
    barClass: 'bg-amber-500',
    textClass: 'text-amber-800',
  },
  empty: {
    label: 'empty',
    icon: '○',
    dotClass: 'bg-neutral-300',
    badgeClass: `${baseBadge} bg-neutral-100 text-neutral-600`,
    borderClass: 'border-neutral-300',
    barClass: 'bg-neutral-300',
    textClass: 'text-neutral-700',
  },
  watching: {
    label: 'watching',
    icon: '●',
    dotClass: 'bg-blue-500',
    badgeClass: `${baseBadge} bg-blue-100 text-blue-800`,
    borderClass: 'border-blue-500',
    barClass: 'bg-blue-500',
    textClass: 'text-blue-800',
  },
  connected: {
    label: 'connected',
    icon: '✓',
    dotClass: 'bg-emerald-500',
    badgeClass: `${baseBadge} bg-emerald-100 text-emerald-800`,
    borderClass: 'border-emerald-500',
    barClass: 'bg-emerald-500',
    textClass: 'text-emerald-800',
  },
  disconnected: {
    label: 'disconnected',
    icon: '○',
    dotClass: 'bg-neutral-300',
    badgeClass: `${baseBadge} bg-neutral-100 text-neutral-600`,
    borderClass: 'border-neutral-300',
    barClass: 'bg-neutral-300',
    textClass: 'text-neutral-700',
  },
}

export function signal(key: SignalKey): Signal {
  return signals[key] ?? signals.pending
}

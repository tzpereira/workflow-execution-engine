import type {
  NotificationEventKey,
  NotificationSettings,
} from './audit'
import type { LiveState, WFEvent } from './live'

export interface AppNotification {
  id: string
  key: NotificationEventKey
  title: string
  body: string
  createdAt: number
  executionId: string
  read: boolean
}

const defaultEvents: Record<NotificationEventKey, boolean> = {
  finished: true,
  failed: true,
  cancelled: true,
  'budget-warning': true,
  'budget-exceeded': true,
  'contract-violation': true,
  'approval-needed': true,
}

export function notificationDefaults(): NotificationSettings {
  return {
    enabled: true,
    browserEnabled: false,
    events: defaultEvents,
    thresholds: {},
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
  }
}

export function mergeNotificationSettings(
  settings?: NotificationSettings,
): NotificationSettings & { enabled: boolean; browserEnabled: boolean } {
  const defaults = notificationDefaults()
  return {
    ...defaults,
    ...settings,
    enabled: settings?.enabled ?? true,
    browserEnabled: settings?.browserEnabled ?? false,
    events: { ...defaults.events, ...(settings?.events ?? {}) },
    thresholds: { ...defaults.thresholds, ...(settings?.thresholds ?? {}) },
    quietHours: { ...defaults.quietHours, ...(settings?.quietHours ?? {}) },
  }
}

export function deriveNotifications(
  live: LiveState,
  settings?: NotificationSettings,
  now = new Date(),
): AppNotification[] {
  const rules = mergeNotificationSettings(settings)
  if (!rules.enabled || inQuietHours(rules.quietHours, now)) return []

  const out: AppNotification[] = []
  for (const ev of live.events) {
    const key = keyForEvent(ev)
    if (!key || rules.events?.[key] === false) continue
    if (rules.thresholds?.onFailureOnly && key !== 'failed') continue
    if (!passesThresholds(live, rules, key)) continue
    out.push(notificationFor(ev, live, key))
  }
  return dedupe(out)
}

function keyForEvent(ev: WFEvent): NotificationEventKey | null {
  if (ev.type === 'BudgetWarning') return 'budget-warning'
  if (ev.type === 'BudgetExceeded') return 'budget-exceeded'
  if (ev.type === 'ContractViolation') return 'contract-violation'
  if (ev.type === 'ExecutionFinished') {
    const state = typeof ev.payload?.state === 'string' ? ev.payload.state : ''
    if (state === 'failed') return 'failed'
    if (state === 'cancelled') return 'cancelled'
    return 'finished'
  }
  return null
}

function notificationFor(
  ev: WFEvent,
  live: LiveState,
  key: NotificationEventKey,
): AppNotification {
  const workflow = live.workflow ? `${live.workflow}@${live.version ?? ''}` : ev.executionId
  const metrics = `$${live.totalCostUsd.toFixed(4)} · ${live.totalTokens} tok`
  const node = ev.nodeId ? ` · ${ev.nodeId}` : ''
  const titles: Record<NotificationEventKey, string> = {
    finished: 'Run finished',
    failed: 'Run failed',
    cancelled: 'Run cancelled',
    'budget-warning': 'Budget warning',
    'budget-exceeded': 'Budget exceeded',
    'contract-violation': 'Contract violation',
    'approval-needed': 'Approval needed',
  }
  return {
    id: `${ev.executionId}:${ev.type}:${ev.nodeId ?? ''}:${ev.timestamp}`,
    key,
    title: titles[key],
    body: `${workflow}${node} · ${metrics}`,
    createdAt: Date.parse(ev.timestamp) || Date.now(),
    executionId: ev.executionId,
    read: false,
  }
}

function passesThresholds(
  live: LiveState,
  settings: NotificationSettings,
  key: NotificationEventKey,
) {
  const thresholds = settings.thresholds ?? {}
  if (key === 'failed' || key === 'cancelled' || key.startsWith('budget')) {
    return true
  }
  if (
    typeof thresholds.minCostUsd === 'number' &&
    live.totalCostUsd < thresholds.minCostUsd
  ) {
    return false
  }
  if (
    typeof thresholds.minDurationSec === 'number' &&
    live.startedAt &&
    live.endedAt &&
    (live.endedAt - live.startedAt) / 1000 < thresholds.minDurationSec
  ) {
    return false
  }
  return true
}

function inQuietHours(
  quiet: NotificationSettings['quietHours'],
  now: Date,
): boolean {
  if (!quiet?.enabled || !quiet.start || !quiet.end) return false
  const start = minutes(quiet.start)
  const end = minutes(quiet.end)
  if (start == null || end == null) return false
  const cur = now.getHours() * 60 + now.getMinutes()
  return start <= end
    ? cur >= start && cur < end
    : cur >= start || cur < end
}

function minutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

function dedupe(items: AppNotification[]): AppNotification[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export interface BrowserNotificationAPI {
  permission: NotificationPermission
  requestPermission: () => Promise<NotificationPermission>
  new (title: string, options?: NotificationOptions): Notification
}

export async function requestBrowserPermission(api?: BrowserNotificationAPI) {
  if (!api || api.permission === 'granted' || api.permission === 'denied') {
    return api?.permission ?? 'default'
  }
  return api.requestPermission()
}

export function deliverBrowserNotification(
  item: AppNotification,
  enabled: boolean,
  focused: boolean,
  api?: BrowserNotificationAPI,
) {
  if (!enabled || focused || !api || api.permission !== 'granted') return false
  new api(item.title, { body: item.body, tag: item.id })
  return true
}

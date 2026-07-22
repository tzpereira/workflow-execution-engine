import { describe, expect, it, vi } from 'vitest'

import { emptyLive, reduceAll, type WFEvent } from './live'
import {
  deliverBrowserNotification,
  deriveNotifications,
  requestBrowserPermission,
} from './notifications'

function ev(partial: Partial<WFEvent> & Pick<WFEvent, 'type'>): WFEvent {
  return {
    timestamp: partial.timestamp ?? '2026-07-22T12:00:00.000Z',
    executionId: 'exec-1',
    prevHash: 'x',
    ...partial,
  }
}

describe('notifications', () => {
  it('derives redacted terminal and threshold notifications from existing events', () => {
    const live = reduceAll([
      ev({ type: 'ExecutionStarted', payload: { workflow: 'demo', version: '1.0.0' } }),
      ev({ type: 'BudgetWarning' }),
      ev({ type: 'ContractViolation', nodeId: 'review', payload: { secret: 'sk-never' } }),
      ev({ type: 'ExecutionFinished', payload: { state: 'failed', artifact: 'payload text' } }),
    ])

    const items = deriveNotifications(live)
    expect(items.map((item) => item.key)).toEqual([
      'budget-warning',
      'contract-violation',
      'failed',
    ])
    expect(JSON.stringify(items)).not.toContain('sk-never')
    expect(JSON.stringify(items)).not.toContain('payload text')
  })

  it('applies event toggles, quiet hours, and success thresholds', () => {
    const live = reduceAll([
      ev({ type: 'ExecutionStarted', timestamp: '2026-07-22T10:00:00.000Z', payload: { workflow: 'demo', version: '1.0.0' } }),
      ev({ type: 'WorkerFinished', nodeId: 'a', payload: { costUsd: 0.1, tokens: 10 } }),
      ev({ type: 'ExecutionFinished', timestamp: '2026-07-22T10:00:02.000Z', payload: { state: 'succeeded' } }),
    ])

    expect(
      deriveNotifications(live, { thresholds: { minCostUsd: 1 } }),
    ).toHaveLength(0)
    expect(
      deriveNotifications(live, { events: { finished: false } }),
    ).toHaveLength(0)
    expect(
      deriveNotifications(
        live,
        { quietHours: { enabled: true, start: '09:00', end: '11:00' } },
        new Date(2026, 6, 22, 10, 30),
      ),
    ).toHaveLength(0)
  })

  it('requests browser permission and only delivers when granted and unfocused', async () => {
    const constructed = vi.fn()
    class FakeNotification {
      static permission: NotificationPermission = 'default'
      static requestPermission = vi.fn(
        async () => 'granted' as NotificationPermission,
      )
      constructor() {
        constructed()
      }
    }
    const api = FakeNotification as unknown as import('./notifications').BrowserNotificationAPI
    expect(await requestBrowserPermission(api)).toBe('granted')

    const item = deriveNotifications(reduceAll([ev({ type: 'ExecutionFinished', payload: { state: 'succeeded' } })]))[0]
    FakeNotification.permission = 'granted'
    expect(deliverBrowserNotification(item, true, false, api)).toBe(true)
    expect(constructed).toHaveBeenCalled()
    expect(deliverBrowserNotification(item, true, true, api)).toBe(false)
  })

  it('emits nothing for an empty live state', () => {
    expect(deriveNotifications(emptyLive())).toEqual([])
  })
})

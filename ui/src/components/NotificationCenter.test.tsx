import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as liveClient from '../liveClient'
import { emptyLive, reduceAll, type WFEvent } from '../core/live'
import { useLive } from '../liveStore'
import { NotificationCenter } from './NotificationCenter'

function ev(partial: Partial<WFEvent> & Pick<WFEvent, 'type'>): WFEvent {
  return {
    timestamp: partial.timestamp ?? '2026-07-22T12:00:00.000Z',
    executionId: 'exec-1',
    prevHash: 'x',
    ...partial,
  }
}

describe('NotificationCenter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useLive.setState({ serverUrl: 'http://127.0.0.1:7676', live: emptyLive() })
  })

  it('shows a toast and retains it in the notification list', async () => {
    vi.spyOn(liveClient, 'fetchSettings').mockResolvedValue({
      notifications: { enabled: true },
    })
    render(<NotificationCenter notificationApi={undefined} />)

    act(() => {
      useLive.setState({
        live: reduceAll([
          ev({ type: 'ExecutionStarted', payload: { workflow: 'demo', version: '1.0.0' } }),
          ev({ type: 'ExecutionFinished', payload: { state: 'succeeded' } }),
        ]),
      })
    })

    expect(await screen.findByText('Run finished')).toBeInTheDocument()
    screen.getByRole('button', { name: /Notifications, 1 unread/ }).click()
    expect(screen.getAllByText(/demo@1.0.0/).length).toBeGreaterThan(0)
  })

  it('uses browser notification only when enabled, granted, and unfocused', async () => {
    vi.spyOn(liveClient, 'fetchSettings').mockResolvedValue({
      notifications: { enabled: true, browserEnabled: true },
    })
    vi.spyOn(document, 'hasFocus').mockReturnValue(false)
    const constructed = vi.fn()
    class FakeNotification {
      static permission: NotificationPermission = 'granted'
      static requestPermission = vi.fn()
      constructor() {
        constructed()
      }
    }
    const api = FakeNotification as unknown as import('../core/notifications').BrowserNotificationAPI
    render(<NotificationCenter notificationApi={api} />)
    await waitFor(() => expect(liveClient.fetchSettings).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))

    act(() => {
      useLive.setState({
        live: reduceAll([ev({ type: 'ExecutionFinished', payload: { state: 'failed' } })]),
      })
    })

    await waitFor(() => expect(constructed).toHaveBeenCalled())
  })
})

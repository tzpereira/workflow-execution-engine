import { useEffect, useMemo, useState } from 'react'

import {
  deliverBrowserNotification,
  deriveNotifications,
  mergeNotificationSettings,
  requestBrowserPermission,
  type AppNotification,
  type BrowserNotificationAPI,
} from '../core/notifications'
import { fetchSettings } from '../liveClient'
import { useLive } from '../liveStore'

export function NotificationCenter({
  notificationApi = globalThis.Notification as BrowserNotificationAPI | undefined,
}: {
  notificationApi?: BrowserNotificationAPI
}) {
  const serverUrl = useLive((s) => s.serverUrl)
  const live = useLive((s) => s.live)
  const [settings, setSettings] = useState(() => mergeNotificationSettings())
  const [items, setItems] = useState<AppNotification[]>([])
  const [open, setOpen] = useState(false)
  const [permission, setPermission] = useState<NotificationPermission>(
    notificationApi?.permission ?? 'default',
  )

  useEffect(() => {
    let cancelled = false
    fetchSettings(serverUrl)
      .then((s) => {
        if (!cancelled) setSettings(mergeNotificationSettings(s.notifications))
      })
      .catch(() => {
        if (!cancelled) setSettings(mergeNotificationSettings())
      })
    return () => {
      cancelled = true
    }
  }, [serverUrl])

  const derived = useMemo(
    () => deriveNotifications(live, settings),
    [live, settings],
  )

  useEffect(() => {
    queueMicrotask(() => {
      setItems((prev) => {
        const known = new Set(prev.map((item) => item.id))
        const fresh = derived.filter((item) => !known.has(item.id))
        for (const item of fresh) {
          deliverBrowserNotification(
            item,
            Boolean(settings.browserEnabled),
            document.hasFocus(),
            notificationApi,
          )
        }
        return fresh.length === 0 ? prev : [...fresh, ...prev].slice(0, 50)
      })
    })
  }, [derived, notificationApi, settings.browserEnabled])

  const unread = items.filter((item) => !item.read).length
  const latest = items[0]

  function dismiss(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  function markAllRead() {
    setItems((prev) => prev.map((item) => ({ ...item, read: true })))
  }

  async function enableBrowser() {
    const next = await requestBrowserPermission(notificationApi)
    setPermission(next)
  }

  return (
    <>
      {latest && !latest.read && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded border border-neutral-200 bg-white p-3 text-sm shadow-lg">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-semibold text-neutral-900">{latest.title}</div>
              <div className="mt-1 text-xs text-neutral-600">{latest.body}</div>
            </div>
            <button type="button" className="btn" onClick={() => dismiss(latest.id)}>
              dismiss
            </button>
          </div>
        </div>
      )}
      <div className="relative">
        <button
          type="button"
          className="btn relative flex h-8 w-8 items-center justify-center p-0"
          onClick={() => {
            markAllRead()
            setOpen((o) => !o)
          }}
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ''}`}
          title="Notifications"
        >
          <BellIcon />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </button>
        {open && (
          <div className="absolute right-0 top-full z-50 mt-2 w-96 max-w-[calc(100vw-1.5rem)] rounded border border-neutral-200 bg-white p-2 text-sm shadow-lg">
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-neutral-200 pb-2">
              <div className="font-semibold text-neutral-900">Notifications</div>
              <button
                type="button"
                className="btn"
                onClick={() => void enableBrowser()}
                disabled={permission === 'granted'}
              >
                {permission === 'granted' ? 'Browser on' : 'Enable browser'}
              </button>
            </div>
            {items.length === 0 ? (
              <p className="px-1 py-2 text-xs text-neutral-500">No notifications yet.</p>
            ) : (
              <ul className="max-h-80 space-y-1 overflow-auto">
                {items.map((item) => (
                  <li key={item.id} className="rounded border border-neutral-100 p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-neutral-900">{item.title}</div>
                        <div className="mt-0.5 text-xs text-neutral-600">{item.body}</div>
                      </div>
                      <button type="button" className="btn" onClick={() => dismiss(item.id)}>
                        dismiss
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
      <path
        d="M5 6.5a3 3 0 1 1 6 0c0 2 .7 3 1.3 3.8H3.7C4.3 9.5 5 8.5 5 6.5ZM6.7 12.2a1.5 1.5 0 0 0 2.6 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
    </svg>
  )
}

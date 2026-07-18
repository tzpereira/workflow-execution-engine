import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WFEvent } from './core/live'
import { startRun, watchExecution } from './liveClient'

// A minimal fake EventSource: just enough surface for watchExecution to drive
// (onmessage/onerror assignment, readyState, close()) without a real network
// connection or a jsdom EventSource polyfill.
class FakeEventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSED = 2

  url: string
  readyState = FakeEventSource.OPEN
  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  onerror: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
  }

  emit(ev: WFEvent) {
    this.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent<string>)
  }

  fail() {
    this.readyState = FakeEventSource.CLOSED
    this.onerror?.()
  }

  close() {
    this.closed = true
  }
}

describe('watchExecution', () => {
  it('builds the SSE URL from baseUrl and the execution id', () => {
    let created: FakeEventSource | undefined
    const ESImpl = class extends FakeEventSource {
      constructor(url: string) {
        super(url)
        created = this
      }
    } as unknown as typeof EventSource

    watchExecution('wf-123', { onEvent: () => {}, onDone: () => {} }, { baseUrl: 'http://127.0.0.1:7676', EventSourceImpl: ESImpl })

    expect(created?.url).toBe('http://127.0.0.1:7676/api/executions/wf-123/events')
  })

  it('parses each message frame and forwards it as a WFEvent', () => {
    let fake: FakeEventSource | undefined
    const ESImpl = class extends FakeEventSource {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof EventSource

    const onEvent = vi.fn()
    watchExecution('wf-123', { onEvent, onDone: () => {} }, { EventSourceImpl: ESImpl })

    const ev: WFEvent = { type: 'ExecutionStarted', timestamp: 't', executionId: 'wf-123', prevHash: 'x' }
    fake!.emit(ev)

    expect(onEvent).toHaveBeenCalledWith(ev)
  })

  it('drops a malformed frame without calling onEvent or throwing', () => {
    let fake: FakeEventSource | undefined
    const ESImpl = class extends FakeEventSource {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof EventSource

    const onEvent = vi.fn()
    watchExecution('wf-123', { onEvent, onDone: () => {} }, { EventSourceImpl: ESImpl })

    expect(() => fake!.onmessage?.({ data: 'not json' } as MessageEvent<string>)).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('calls onDone only once the connection reaches CLOSED, not on a transient error', () => {
    let fake: FakeEventSource | undefined
    const ESImpl = class extends FakeEventSource {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof EventSource

    const onDone = vi.fn()
    watchExecution('wf-123', { onEvent: () => {}, onDone }, { EventSourceImpl: ESImpl })

    // A transient error while still OPEN/CONNECTING (auto-reconnect in flight)
    // must not fire onDone.
    fake!.readyState = FakeEventSource.CONNECTING
    fake!.onerror?.()
    expect(onDone).not.toHaveBeenCalled()

    fake!.fail() // reaches CLOSED
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('the returned disposer closes the connection', () => {
    let fake: FakeEventSource | undefined
    const ESImpl = class extends FakeEventSource {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof EventSource

    const stop = watchExecution('wf-123', { onEvent: () => {}, onDone: () => {} }, { EventSourceImpl: ESImpl })
    stop()
    expect(fake?.closed).toBe(true)
  })
})

describe('startRun', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the workflow ref and returns the execution id', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:7676/api/run')
      expect(JSON.parse(String(init?.body))).toEqual({ workflow: 'check.yaml' })
      return new Response(JSON.stringify({ executionId: 'exec-1' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const id = await startRun('http://127.0.0.1:7676', 'check.yaml')
    expect(id).toBe('exec-1')
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('workflow not found', { status: 400 })),
    )
    await expect(startRun('http://127.0.0.1:7676', 'missing.yaml')).rejects.toThrow('workflow not found')
  })
})

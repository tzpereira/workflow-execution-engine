import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Audit, ExecutionSummary } from './core/audit'
import type { WFEvent } from './core/live'
import { fetchAudit, fetchExecutions, startRun, watchExecution } from './liveClient'

// A minimal fake WebSocket: just enough surface for watchExecution to drive
// (onmessage/onclose assignment, close()) without a real network connection or
// a jsdom WebSocket polyfill.
class FakeWebSocket {
  url: string
  onmessage: ((ev: MessageEvent<string>) => void) | null = null
  onclose: (() => void) | null = null
  closed = false

  constructor(url: string) {
    this.url = url
  }

  emit(ev: WFEvent) {
    this.onmessage?.({ data: JSON.stringify(ev) } as MessageEvent<string>)
  }

  serverClose() {
    this.closed = true
    this.onclose?.()
  }

  close() {
    this.closed = true
    this.onclose?.()
  }
}

describe('watchExecution', () => {
  it('rewrites an http(s) baseUrl to ws(s) and builds the URL from the execution id', () => {
    let created: FakeWebSocket | undefined
    const WSImpl = class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        created = this
      }
    } as unknown as typeof WebSocket

    watchExecution('wf-123', { onEvent: () => {}, onDone: () => {} }, { baseUrl: 'http://127.0.0.1:7676', WebSocketImpl: WSImpl })

    expect(created?.url).toBe('ws://127.0.0.1:7676/api/executions/wf-123/events')
  })

  it('rewrites an https baseUrl to wss', () => {
    let created: FakeWebSocket | undefined
    const WSImpl = class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        created = this
      }
    } as unknown as typeof WebSocket

    watchExecution('wf-123', { onEvent: () => {}, onDone: () => {} }, { baseUrl: 'https://example.test', WebSocketImpl: WSImpl })

    expect(created?.url).toBe('wss://example.test/api/executions/wf-123/events')
  })

  it('parses each message frame and forwards it as a WFEvent', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof WebSocket

    const onEvent = vi.fn()
    watchExecution('wf-123', { onEvent, onDone: () => {} }, { WebSocketImpl: WSImpl })

    const ev: WFEvent = { type: 'ExecutionStarted', timestamp: 't', executionId: 'wf-123', prevHash: 'x' }
    fake!.emit(ev)

    expect(onEvent).toHaveBeenCalledWith(ev)
  })

  it('drops a malformed frame without calling onEvent or throwing', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof WebSocket

    const onEvent = vi.fn()
    watchExecution('wf-123', { onEvent, onDone: () => {} }, { WebSocketImpl: WSImpl })

    expect(() => fake!.onmessage?.({ data: 'not json' } as MessageEvent<string>)).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('calls onDone once when the connection closes (no auto-reconnect, unlike EventSource)', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof WebSocket

    const onDone = vi.fn()
    watchExecution('wf-123', { onEvent: () => {}, onDone }, { WebSocketImpl: WSImpl })

    expect(onDone).not.toHaveBeenCalled()
    fake!.serverClose() // the server closes cleanly after ExecutionFinished
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('the returned disposer closes the connection', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = class extends FakeWebSocket {
      constructor(url: string) {
        super(url)
        fake = this
      }
    } as unknown as typeof WebSocket

    const stop = watchExecution('wf-123', { onEvent: () => {}, onDone: () => {} }, { WebSocketImpl: WSImpl })
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

describe('fetchAudit', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs the execution and returns the parsed Audit', async () => {
    const audit: Audit = {
      executionId: 'exec-1',
      workflow: { id: 'wf', version: '1.0.0', nodes: [], edges: [], budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 } },
      budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 },
      events: [],
      nodes: {},
      spentCostUsd: 0,
      spentTokens: 0,
      state: 'succeeded',
    }
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:7676/api/executions/exec-1')
      return new Response(JSON.stringify(audit), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchAudit('http://127.0.0.1:7676', 'exec-1')).resolves.toEqual(audit)
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unknown execution', { status: 404 })),
    )
    await expect(fetchAudit('http://127.0.0.1:7676', 'missing')).rejects.toThrow('unknown execution')
  })
})

describe('fetchExecutions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs the list and returns the parsed ExecutionSummary[]', async () => {
    const list: ExecutionSummary[] = [
      { id: 'exec-1', workflow: 'wf', version: '1.0.0', state: 'succeeded', spentCostUsd: 0.01, spentTokens: 5, durationMs: 100 },
    ]
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:7676/api/executions')
      return new Response(JSON.stringify(list), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchExecutions('http://127.0.0.1:7676')).resolves.toEqual(list)
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    )
    await expect(fetchExecutions('http://127.0.0.1:7676')).rejects.toThrow('server error')
  })
})

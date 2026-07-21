import { afterEach, describe, expect, it, vi } from 'vitest'

import type {
  Audit,
  ExecutionSummary,
  ImportedTemplate,
  Template,
} from './core/audit'
import type { WFEvent } from './core/live'
import type { Worker } from './core/model'
import {
  bundleUrl,
  cancelExecution,
  clearCache,
  fetchAudit,
  fetchExecutions,
  fetchSecretsStatus,
  fetchSettings,
  fetchTemplates,
  fetchWorkerVersions,
  importTemplate,
  reexecuteExecution,
  retryExecution,
  saveSettings,
  saveWorker,
  setSecret,
  startRun,
  unsetSecret,
  watchExecution,
} from './liveClient'

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

function fakeWebSocketImpl(
  onCreate: (socket: FakeWebSocket) => void,
): typeof WebSocket {
  return class extends FakeWebSocket {
    constructor(url: string) {
      super(url)
      onCreate(this)
    }
  } as unknown as typeof WebSocket
}

describe('watchExecution', () => {
  it('rewrites an http(s) baseUrl to ws(s) and builds the URL from the execution id', () => {
    let created: FakeWebSocket | undefined
    const WSImpl = fakeWebSocketImpl((socket) => {
      created = socket
    })

    watchExecution(
      'wf-123',
      { onEvent: () => {}, onDone: () => {} },
      { baseUrl: 'http://127.0.0.1:7676', WebSocketImpl: WSImpl },
    )

    expect(created?.url).toBe(
      'ws://127.0.0.1:7676/api/executions/wf-123/events',
    )
  })

  it('rewrites an https baseUrl to wss', () => {
    let created: FakeWebSocket | undefined
    const WSImpl = fakeWebSocketImpl((socket) => {
      created = socket
    })

    watchExecution(
      'wf-123',
      { onEvent: () => {}, onDone: () => {} },
      { baseUrl: 'https://example.test', WebSocketImpl: WSImpl },
    )

    expect(created?.url).toBe('wss://example.test/api/executions/wf-123/events')
  })

  it('parses each message frame and forwards it as a WFEvent', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = fakeWebSocketImpl((socket) => {
      fake = socket
    })

    const onEvent = vi.fn()
    watchExecution(
      'wf-123',
      { onEvent, onDone: () => {} },
      { WebSocketImpl: WSImpl },
    )

    const ev: WFEvent = {
      type: 'ExecutionStarted',
      timestamp: 't',
      executionId: 'wf-123',
      prevHash: 'x',
    }
    fake!.emit(ev)

    expect(onEvent).toHaveBeenCalledWith(ev)
  })

  it('drops a malformed frame without calling onEvent or throwing', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = fakeWebSocketImpl((socket) => {
      fake = socket
    })

    const onEvent = vi.fn()
    watchExecution(
      'wf-123',
      { onEvent, onDone: () => {} },
      { WebSocketImpl: WSImpl },
    )

    expect(() =>
      fake!.onmessage?.({ data: 'not json' } as MessageEvent<string>),
    ).not.toThrow()
    expect(onEvent).not.toHaveBeenCalled()
  })

  it('calls onDone once when the connection closes (no auto-reconnect, unlike EventSource)', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = fakeWebSocketImpl((socket) => {
      fake = socket
    })

    const onDone = vi.fn()
    watchExecution(
      'wf-123',
      { onEvent: () => {}, onDone },
      { WebSocketImpl: WSImpl },
    )

    expect(onDone).not.toHaveBeenCalled()
    fake!.serverClose() // the server closes cleanly after ExecutionFinished
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('the returned disposer closes the connection', () => {
    let fake: FakeWebSocket | undefined
    const WSImpl = fakeWebSocketImpl((socket) => {
      fake = socket
    })

    const stop = watchExecution(
      'wf-123',
      { onEvent: () => {}, onDone: () => {} },
      { WebSocketImpl: WSImpl },
    )
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
      return new Response(JSON.stringify({ executionId: 'exec-1' }), {
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const id = await startRun('http://127.0.0.1:7676', 'check.yaml')
    expect(id).toBe('exec-1')
  })

  it('includes inputs in the request body when supplied', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        workflow: 'check.yaml',
        inputs: { prUrl: 'https://example.com/42' },
      })
      return new Response(JSON.stringify({ executionId: 'exec-1' }), {
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await startRun('http://127.0.0.1:7676', 'check.yaml', {
      prUrl: 'https://example.com/42',
    })
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('workflow not found', { status: 400 })),
    )
    await expect(
      startRun('http://127.0.0.1:7676', 'missing.yaml'),
    ).rejects.toThrow('workflow not found')
  })
})

describe('fetchAudit', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs the execution and returns the parsed Audit', async () => {
    const audit: Audit = {
      executionId: 'exec-1',
      workflow: {
        id: 'wf',
        version: '1.0.0',
        nodes: [],
        edges: [],
        budget: {
          maxCostUsd: 0,
          maxTokens: 0,
          maxDurationMs: 0,
          maxRetriesPerNode: 0,
        },
      },
      budget: {
        maxCostUsd: 0,
        maxTokens: 0,
        maxDurationMs: 0,
        maxRetriesPerNode: 0,
      },
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

    await expect(
      fetchAudit('http://127.0.0.1:7676', 'exec-1'),
    ).resolves.toEqual(audit)
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unknown execution', { status: 404 })),
    )
    await expect(
      fetchAudit('http://127.0.0.1:7676', 'missing'),
    ).rejects.toThrow('unknown execution')
  })
})

describe('fetchExecutions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs the list and returns the parsed ExecutionSummary[]', async () => {
    const list: ExecutionSummary[] = [
      {
        id: 'exec-1',
        workflow: 'wf',
        version: '1.0.0',
        state: 'succeeded',
        spentCostUsd: 0.01,
        spentTokens: 5,
        durationMs: 100,
      },
    ]
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:7676/api/executions')
      return new Response(JSON.stringify(list), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchExecutions('http://127.0.0.1:7676')).resolves.toEqual(
      list,
    )
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    )
    await expect(fetchExecutions('http://127.0.0.1:7676')).rejects.toThrow(
      'server error',
    )
  })
})

describe('fetchTemplates', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs the list and returns the parsed Template[]', async () => {
    const list: Template[] = [
      {
        name: 'pr-review-autofix',
        workflowId: 'pr-review-autofix',
        version: '1.0.0',
        nodeCount: 8,
      },
    ]
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe('http://127.0.0.1:7676/api/templates')
      return new Response(JSON.stringify(list), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchTemplates('http://127.0.0.1:7676')).resolves.toEqual(list)
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('server error', { status: 500 })),
    )
    await expect(fetchTemplates('http://127.0.0.1:7676')).rejects.toThrow(
      'server error',
    )
  })
})

describe('importTemplate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to the template name and returns the parsed ImportedTemplate', async () => {
    const result: ImportedTemplate = {
      workflowPath: 'pr-review-autofix/workflow.yaml',
      workflow: {
        id: 'pr-review-autofix',
        version: '1.0.0',
        nodes: [],
        edges: [],
        budget: {
          maxCostUsd: 0,
          maxTokens: 0,
          maxDurationMs: 0,
          maxRetriesPerNode: 0,
        },
      },
    }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe(
        'http://127.0.0.1:7676/api/templates/pr-review-autofix/import',
      )
      expect(init?.method).toBe('POST')
      return new Response(JSON.stringify(result), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      importTemplate('http://127.0.0.1:7676', 'pr-review-autofix'),
    ).resolves.toEqual(result)
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('unknown template', { status: 404 })),
    )
    await expect(
      importTemplate('http://127.0.0.1:7676', 'missing'),
    ).rejects.toThrow('unknown template')
  })
})

const demoWorker: Worker = {
  id: 'reviewer',
  version: '1.0.0',
  objective: 'review code',
  constraints: [],
  tools: [],
  contextPolicy: { mode: 'diff-only' },
  contract: {
    goal: 'produce a verdict',
    rules: [],
    outputSchema: { type: 'object' },
    successCriteria: [],
    maxRetries: 2,
  },
  model: { provider: 'openai', model: 'gpt-4o-mini' },
}

describe('fetchWorkerVersions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs /api/workers/{id} with the dir query param and returns the versions array', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(
        'http://127.0.0.1:7676/api/workers/reviewer?dir=pr-review-autofix',
      )
      return new Response(JSON.stringify({ versions: [demoWorker] }), {
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchWorkerVersions(
        'http://127.0.0.1:7676',
        'reviewer',
        'pr-review-autofix',
      ),
    ).resolves.toEqual([demoWorker])
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    )
    await expect(
      fetchWorkerVersions('http://127.0.0.1:7676', 'reviewer', ''),
    ).rejects.toThrow('boom')
  })
})

describe('saveWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs the worker and dir, returns the server-saved copy', async () => {
    const saved = { ...demoWorker, version: '1.0.1' }
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:7676/api/workers')
      expect(JSON.parse(String(init?.body))).toEqual({
        worker: demoWorker,
        dir: 'pr-review-autofix',
      })
      return new Response(JSON.stringify({ worker: saved }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      saveWorker('http://127.0.0.1:7676', demoWorker, 'pr-review-autofix'),
    ).resolves.toEqual(saved)
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('worker.id is required', { status: 400 })),
    )
    await expect(
      saveWorker('http://127.0.0.1:7676', demoWorker, ''),
    ).rejects.toThrow('worker.id is required')
  })
})

describe('fetchSecretsStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('GETs /api/secrets with a comma-joined names query and returns the presence map', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe(
        'http://127.0.0.1:7676/api/secrets?names=OPENAI_API_KEY%2CGITHUB_AUTH_HEADER',
      )
      return new Response(
        JSON.stringify({ OPENAI_API_KEY: true, GITHUB_AUTH_HEADER: false }),
        { status: 200 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      fetchSecretsStatus('http://127.0.0.1:7676', [
        'OPENAI_API_KEY',
        'GITHUB_AUTH_HEADER',
      ]),
    ).resolves.toEqual({
      OPENAI_API_KEY: true,
      GITHUB_AUTH_HEADER: false,
    })
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('boom', { status: 500 })),
    )
    await expect(
      fetchSecretsStatus('http://127.0.0.1:7676', ['X']),
    ).rejects.toThrow('boom')
  })
})

describe('setSecret', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs name and value', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:7676/api/secrets')
      expect(JSON.parse(String(init?.body))).toEqual({
        name: 'OPENAI_API_KEY',
        value: 'sk-live-example',
      })
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      setSecret('http://127.0.0.1:7676', 'OPENAI_API_KEY', 'sk-live-example'),
    ).resolves.toBeUndefined()
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('name is required', { status: 400 })),
    )
    await expect(setSecret('http://127.0.0.1:7676', '', 'v')).rejects.toThrow(
      'name is required',
    )
  })
})

describe('unsetSecret', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DELETEs with the name query param', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:7676/api/secrets?name=OPENAI_API_KEY')
      expect(init?.method).toBe('DELETE')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      unsetSecret('http://127.0.0.1:7676', 'OPENAI_API_KEY'),
    ).resolves.toBeUndefined()
  })

  it('throws with the server error body on a non-OK response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('name is required', { status: 400 })),
    )
    await expect(unsetSecret('http://127.0.0.1:7676', '')).rejects.toThrow(
      'name is required',
    )
  })
})

describe('run controls', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retryExecution POSTs {from} and returns the id', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://s/api/executions/e1/retry')
      expect(JSON.parse(String(init?.body))).toEqual({ from: 'nodeB' })
      return new Response(JSON.stringify({ executionId: 'e1' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(retryExecution('http://s', 'e1', 'nodeB')).resolves.toBe('e1')
  })

  it('reexecuteExecution returns the new execution id', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ executionId: 'e2' }), { status: 200 })))
    await expect(reexecuteExecution('http://s', 'e1')).resolves.toBe('e2')
  })

  it('cancelExecution surfaces a 409 as an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('execution is not running', { status: 409 })))
    await expect(cancelExecution('http://s', 'e1')).rejects.toThrow('not running')
  })

  it('clearCache returns the removed count', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ executionId: 'e1', nodeId: 'a' })
      return new Response(JSON.stringify({ removed: 2 }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(clearCache('http://s', { executionId: 'e1', nodeId: 'a' })).resolves.toBe(2)
  })

  it('bundleUrl builds the download URL', () => {
    expect(bundleUrl('http://s', 'e 1')).toBe('http://s/api/executions/e%201/bundle')
  })
})

describe('durable settings', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetchSettings returns the persisted config', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ cacheMode: 'readonly' }), { status: 200 })))
    await expect(fetchSettings('http://s')).resolves.toEqual({ cacheMode: 'readonly' })
  })

  it('saveSettings PUTs and returns the saved copy', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://s/api/settings')
      expect(init?.method).toBe('PUT')
      return new Response(String(init?.body), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(saveSettings('http://s', { defaultBudgetUsd: 5 })).resolves.toEqual({ defaultBudgetUsd: 5 })
  })
})

import { describe, expect, it, vi } from 'vitest'

import type { Audit } from './core/audit'
import type { WFEvent } from './core/live'
import { createLiveStore, type LiveDeps } from './liveStore'

function fakeAudit(executionId: string): Audit {
  return {
    executionId,
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
}

function fakeDeps() {
  const stops: Array<() => void> = []
  let capturedOnEvent: ((ev: WFEvent) => void) | null = null
  let capturedOnDone: (() => void) | null = null

  const watchExecution = vi.fn(
    (
      _execId: string,
      handlers: { onEvent: (ev: WFEvent) => void; onDone: () => void },
    ) => {
      capturedOnEvent = handlers.onEvent
      capturedOnDone = handlers.onDone
      const stop = vi.fn()
      stops.push(stop)
      return stop
    },
  ) as unknown as LiveDeps['watchExecution']

  const startRun = vi.fn(
    async () => 'exec-1',
  ) as unknown as LiveDeps['startRun']
  const fetchAudit = vi.fn(async (_url: string, execId: string) =>
    fakeAudit(execId),
  ) as unknown as LiveDeps['fetchAudit']
  const fetchExecutions = vi.fn(
    async () => [],
  ) as unknown as LiveDeps['fetchExecutions']
  const fetchTemplates = vi.fn(
    async () => [],
  ) as unknown as LiveDeps['fetchTemplates']
  const cancelExecution = vi.fn(
    async () => undefined,
  ) as unknown as LiveDeps['cancelExecution']
  const approveExecution = vi.fn(
    async () => undefined,
  ) as unknown as LiveDeps['approveExecution']
  const rejectExecution = vi.fn(
    async () => undefined,
  ) as unknown as LiveDeps['rejectExecution']
  const retryExecution = vi.fn(
    async (_url: string, id: string) => id,
  ) as unknown as LiveDeps['retryExecution']
  const reexecuteExecution = vi.fn(
    async () => 'exec-2',
  ) as unknown as LiveDeps['reexecuteExecution']
  const clearCache = vi.fn(async () => 1) as unknown as LiveDeps['clearCache']

  return {
    deps: {
      watchExecution,
      startRun,
      fetchAudit,
      fetchExecutions,
      fetchTemplates,
      cancelExecution,
      approveExecution,
      rejectExecution,
      retryExecution,
      reexecuteExecution,
      clearCache,
    },
    stops,
    emit: (ev: WFEvent) => capturedOnEvent?.(ev),
    done: () => capturedOnDone?.(),
  }
}

describe('liveStore', () => {
  it('watch resets state seeded with the given node ids and marks connected', () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a', 'b'])

    const s = store.getState()
    expect(s.connected).toBe(true)
    expect(s.live.executionId).toBe(null) // reset to emptyLive until ExecutionStarted arrives
    expect(s.live.nodes.a.status).toBe('pending')
    expect(s.live.nodes.b.status).toBe('pending')
    expect(deps.watchExecution).toHaveBeenCalledWith(
      'exec-1',
      expect.objectContaining({
        onEvent: expect.any(Function),
        onDone: expect.any(Function),
      }),
      { baseUrl: 'http://127.0.0.1:7676' },
    )
  })

  it('folds events arriving from the transport into live state', () => {
    const { deps, emit } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])

    emit({
      type: 'ExecutionStarted',
      timestamp: 't',
      executionId: 'exec-1',
      prevHash: 'x',
      payload: { workflow: 'wf', version: '1.0.0' },
    })
    emit({
      type: 'WorkerStarted',
      timestamp: 't',
      executionId: 'exec-1',
      nodeId: 'a',
      prevHash: 'y',
    })

    const s = store.getState()
    expect(s.live.executionId).toBe('exec-1')
    expect(s.live.nodes.a.status).toBe('running')
  })

  it('marks disconnected once the transport signals done', () => {
    const { deps, done } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])
    expect(store.getState().connected).toBe(true)

    done()
    expect(store.getState().connected).toBe(false)
  })

  it('watching another execution keeps the previous stream open in its own tab', () => {
    const { deps, stops } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])
    store.getState().watch('exec-2', ['a'])

    expect(stops[0]).not.toHaveBeenCalled()
    expect(store.getState().tabs.map((t) => t.id)).toEqual(['exec-1', 'exec-2'])
    expect(store.getState().activeTabId).toBe('exec-2')
  })

  it('disconnect stops the stream and clears connected', () => {
    const { deps, stops } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])
    store.getState().disconnect()

    expect(stops[0]).toHaveBeenCalledTimes(1)
    expect(store.getState().connected).toBe(false)
    expect(store.getState().stop).toBe(null)
  })

  it('run posts via startRun then watches the returned execution id', async () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    await store.getState().run('check.yaml', ['a'])

    expect(deps.startRun).toHaveBeenCalledWith(
      'http://127.0.0.1:7676',
      'check.yaml',
      undefined,
    )
    expect(deps.watchExecution).toHaveBeenCalledWith(
      'exec-1',
      expect.anything(),
      expect.anything(),
    )
    expect(store.getState().connected).toBe(true)
  })

  it('run forwards supplied inputs to startRun', async () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    await store
      .getState()
      .run('check.yaml', ['a'], { prUrl: 'https://example.com/42' })

    expect(deps.startRun).toHaveBeenCalledWith(
      'http://127.0.0.1:7676',
      'check.yaml',
      { prUrl: 'https://example.com/42' },
    )
  })

  it('run records the error and never calls watch when startRun rejects', async () => {
    const deps: LiveDeps = {
      watchExecution: vi.fn() as unknown as LiveDeps['watchExecution'],
      startRun: vi.fn(async () => {
        throw new Error('workflow not found')
      }) as unknown as LiveDeps['startRun'],
      fetchAudit: vi.fn() as unknown as LiveDeps['fetchAudit'],
      fetchExecutions: vi.fn() as unknown as LiveDeps['fetchExecutions'],
      fetchTemplates: vi.fn() as unknown as LiveDeps['fetchTemplates'],
      cancelExecution: vi.fn() as unknown as LiveDeps['cancelExecution'],
      retryExecution: vi.fn() as unknown as LiveDeps['retryExecution'],
      reexecuteExecution: vi.fn() as unknown as LiveDeps['reexecuteExecution'],
      approveExecution: vi.fn() as unknown as LiveDeps['approveExecution'],
      rejectExecution: vi.fn() as unknown as LiveDeps['rejectExecution'],
      clearCache: vi.fn() as unknown as LiveDeps['clearCache'],
    }
    const store = createLiveStore(deps)
    await store.getState().run('missing.yaml', [])

    expect(store.getState().error).toBe('workflow not found')
    expect(store.getState().connected).toBe(false)
    expect(deps.watchExecution).not.toHaveBeenCalled()
  })

  it('watch fetches the audit immediately and again once the stream closes', async () => {
    const { deps, done } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])
    await vi.waitFor(() =>
      expect(store.getState().audit?.executionId).toBe('exec-1'),
    )
    expect(deps.fetchAudit).toHaveBeenCalledTimes(1)

    done()
    await vi.waitFor(() => expect(deps.fetchAudit).toHaveBeenCalledTimes(2))
  })

  it('watching a new execution clears the previous audit until the new one loads', () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])
    store.getState().watch('exec-2', ['a'])

    // Synchronous assertion, before the fake fetchAudit's microtask resolves.
    expect(store.getState().audit).toBe(null)
  })

  it('loadExecutions populates the history list', async () => {
    const { deps } = fakeDeps()
    deps.fetchExecutions = vi.fn(async () => [
      {
        id: 'exec-1',
        workflow: 'wf',
        version: '1.0.0',
        state: 'succeeded',
        spentCostUsd: 0.01,
        spentTokens: 5,
        durationMs: 100,
      },
    ]) as unknown as LiveDeps['fetchExecutions']
    const store = createLiveStore(deps)

    await store.getState().loadExecutions()
    expect(store.getState().executions).toHaveLength(1)
    expect(store.getState().executions[0].id).toBe('exec-1')
    expect(store.getState().executionsError).toBe(null)
  })

  it('loadExecutions records the error and leaves the list untouched on failure', async () => {
    const { deps } = fakeDeps()
    deps.fetchExecutions = vi.fn(async () => {
      throw new Error('server unreachable')
    }) as unknown as LiveDeps['fetchExecutions']
    const store = createLiveStore(deps)

    await store.getState().loadExecutions()
    expect(store.getState().executionsError).toBe('server unreachable')
    expect(store.getState().executions).toEqual([])
  })

  it("loadHistorical opens a tab and folds the past run's own events into `live`", async () => {
    const { deps, stops } = fakeDeps()
    deps.fetchAudit = vi.fn(async (_url: string, execId: string) => ({
      ...fakeAudit(execId),
      workflow: {
        id: 'wf',
        version: '1.0.0',
        nodes: [{ id: 'a' }],
        edges: [],
        budget: {
          maxCostUsd: 0,
          maxTokens: 0,
          maxDurationMs: 0,
          maxRetriesPerNode: 0,
        },
      },
      events: [
        {
          type: 'ExecutionStarted' as const,
          timestamp: 't',
          executionId: execId,
          prevHash: '',
          payload: { workflow: 'wf', version: '1.0.0' },
        },
        {
          type: 'WorkerFinished' as const,
          timestamp: 't',
          executionId: execId,
          nodeId: 'a',
          prevHash: '',
          payload: { costUsd: 0.01, tokens: 5 },
        },
      ],
    })) as unknown as LiveDeps['fetchAudit']
    const store = createLiveStore(deps)
    store.getState().watch('exec-live', ['a'])
    expect(store.getState().connected).toBe(true)

    await store.getState().loadHistorical('exec-old')

    expect(stops[0]).not.toHaveBeenCalled()
    expect(store.getState().connected).toBe(false)
    expect(store.getState().audit?.executionId).toBe('exec-old')
    expect(store.getState().live.nodes.a.status).toBe('succeeded')
    expect(store.getState().live.nodes.a.costUsd).toBe(0.01)
    store.getState().switchTab('exec-live')
    expect(store.getState().connected).toBe(true)
  })

  it('loadHistorical records the error when the fetch fails', async () => {
    const { deps } = fakeDeps()
    deps.fetchAudit = vi.fn(async () => {
      throw new Error('unknown execution')
    }) as unknown as LiveDeps['fetchAudit']
    const store = createLiveStore(deps)

    await store.getState().loadHistorical('exec-missing')
    expect(store.getState().error).toBe('unknown execution')
  })

  it('switchTab swaps the active live view without stopping streams', () => {
    const { deps, stops, emit } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])
    emit({
      type: 'ExecutionStarted',
      timestamp: 't',
      executionId: 'exec-1',
      prevHash: 'x',
      payload: { workflow: 'wf', version: '1.0.0' },
    })
    store.getState().watch('exec-2', ['b'])

    store.getState().switchTab('exec-1')

    expect(stops[0]).not.toHaveBeenCalled()
    expect(store.getState().live.executionId).toBe('exec-1')
    expect(store.getState().live.nodes.a.status).toBe('pending')
  })

  it('loadTemplates populates the gallery list', async () => {
    const { deps } = fakeDeps()
    deps.fetchTemplates = vi.fn(async () => [
      {
        name: 'pr-review-autofix',
        workflowId: 'pr-review-autofix',
        version: '1.0.0',
        nodeCount: 8,
      },
    ]) as unknown as LiveDeps['fetchTemplates']
    const store = createLiveStore(deps)

    await store.getState().loadTemplates()
    expect(store.getState().templates).toHaveLength(1)
    expect(store.getState().templates[0].name).toBe('pr-review-autofix')
    expect(store.getState().templatesError).toBe(null)
  })

  it('loadTemplates records the error and leaves the list untouched on failure', async () => {
    const { deps } = fakeDeps()
    deps.fetchTemplates = vi.fn(async () => {
      throw new Error('server unreachable')
    }) as unknown as LiveDeps['fetchTemplates']
    const store = createLiveStore(deps)

    await store.getState().loadTemplates()
    expect(store.getState().templatesError).toBe('server unreachable')
    expect(store.getState().templates).toEqual([])
  })

  it('setServerUrl changes the base url subsequent calls use', () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().setServerUrl('http://example.test:9000')
    store.getState().watch('exec-1', [])

    expect(deps.watchExecution).toHaveBeenCalledWith(
      'exec-1',
      expect.anything(),
      { baseUrl: 'http://example.test:9000' },
    )
  })
})

describe('liveStore run controls', () => {
  it('cancel calls the transport for the current execution', async () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.setState({ audit: fakeAudit('exec-1') })
    await store.getState().cancel()
    expect(deps.cancelExecution).toHaveBeenCalledWith(
      'http://127.0.0.1:7676',
      'exec-1',
    )
  })

  it('retry resumes the current execution then re-watches it', async () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.setState({ audit: fakeAudit('exec-1') })
    await store.getState().retry('nodeB')
    expect(deps.retryExecution).toHaveBeenCalledWith(
      'http://127.0.0.1:7676',
      'exec-1',
      'nodeB',
    )
    expect(deps.watchExecution).toHaveBeenCalled()
    expect(store.getState().connected).toBe(true)
  })

  it('reexecute starts a new execution and watches the new id', async () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.setState({ audit: fakeAudit('exec-1') })
    await store.getState().reexecute()
    expect(deps.reexecuteExecution).toHaveBeenCalledWith(
      'http://127.0.0.1:7676',
      'exec-1',
    )
    // watch() reset the fold seeded for the new run
    expect(store.getState().connected).toBe(true)
  })

  it('clearNodeCache clears the current execution node then reloads the audit', async () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.setState({ audit: fakeAudit('exec-1') })
    await store.getState().clearNodeCache('a')
    expect(deps.clearCache).toHaveBeenCalledWith('http://127.0.0.1:7676', {
      executionId: 'exec-1',
      nodeId: 'a',
    })
  })

  it('control actions are no-ops with no current execution', async () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    await store.getState().cancel()
    await store.getState().retry()
    expect(deps.cancelExecution).not.toHaveBeenCalled()
    expect(deps.retryExecution).not.toHaveBeenCalled()
  })
})

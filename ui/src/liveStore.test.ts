import { describe, expect, it, vi } from 'vitest'

import type { WFEvent } from './core/live'
import { createLiveStore, type LiveDeps } from './liveStore'

function fakeDeps() {
  const stops: Array<() => void> = []
  let capturedOnEvent: ((ev: WFEvent) => void) | null = null
  let capturedOnDone: (() => void) | null = null

  const watchExecution = vi.fn((_execId: string, handlers: { onEvent: (ev: WFEvent) => void; onDone: () => void }) => {
    capturedOnEvent = handlers.onEvent
    capturedOnDone = handlers.onDone
    const stop = vi.fn()
    stops.push(stop)
    return stop
  }) as unknown as LiveDeps['watchExecution']

  const startRun = vi.fn(async (_url: string, _ref: string) => 'exec-1') as unknown as LiveDeps['startRun']

  return {
    deps: { watchExecution, startRun },
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
      expect.objectContaining({ onEvent: expect.any(Function), onDone: expect.any(Function) }),
      { baseUrl: 'http://127.0.0.1:7676' },
    )
  })

  it('folds events arriving from the transport into live state', () => {
    const { deps, emit } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])

    emit({ type: 'ExecutionStarted', timestamp: 't', executionId: 'exec-1', prevHash: 'x', payload: { workflow: 'wf', version: '1.0.0' } })
    emit({ type: 'WorkerStarted', timestamp: 't', executionId: 'exec-1', nodeId: 'a', prevHash: 'y' })

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

  it('watching again stops the previous stream', () => {
    const { deps, stops } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().watch('exec-1', ['a'])
    store.getState().watch('exec-2', ['a'])

    expect(stops[0]).toHaveBeenCalledTimes(1)
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

    expect(deps.startRun).toHaveBeenCalledWith('http://127.0.0.1:7676', 'check.yaml')
    expect(deps.watchExecution).toHaveBeenCalledWith('exec-1', expect.anything(), expect.anything())
    expect(store.getState().connected).toBe(true)
  })

  it('run records the error and never calls watch when startRun rejects', async () => {
    const deps: LiveDeps = {
      watchExecution: vi.fn() as unknown as LiveDeps['watchExecution'],
      startRun: vi.fn(async () => {
        throw new Error('workflow not found')
      }) as unknown as LiveDeps['startRun'],
    }
    const store = createLiveStore(deps)
    await store.getState().run('missing.yaml', [])

    expect(store.getState().error).toBe('workflow not found')
    expect(store.getState().connected).toBe(false)
    expect(deps.watchExecution).not.toHaveBeenCalled()
  })

  it('setServerUrl changes the base url subsequent calls use', () => {
    const { deps } = fakeDeps()
    const store = createLiveStore(deps)
    store.getState().setServerUrl('http://example.test:9000')
    store.getState().watch('exec-1', [])

    expect(deps.watchExecution).toHaveBeenCalledWith('exec-1', expect.anything(), { baseUrl: 'http://example.test:9000' })
  })
})

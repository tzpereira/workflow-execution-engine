// The live-execution store: wires liveClient's transport into core/live's pure
// reducer and exposes it to components. Kept separate from the workspace store
// (store.ts) on purpose — that store is the workflow *definition* being edited;
// this one is a *view* of an execution happening elsewhere, driven solely by
// the wee serve event stream (REQ-UI-02, PRIN-02). Neither reads the other.

import { create, type StoreApi, type UseBoundStore } from 'zustand'

import { emptyLive, reduce, type LiveState } from './core/live'
import { startRun as defaultStartRun, watchExecution as defaultWatchExecution } from './liveClient'

export interface LiveDeps {
  watchExecution: typeof defaultWatchExecution
  startRun: typeof defaultStartRun
}

const defaultDeps: LiveDeps = { watchExecution: defaultWatchExecution, startRun: defaultStartRun }

export interface LiveStoreState {
  serverUrl: string
  live: LiveState
  connected: boolean
  error: string | null
  stop: (() => void) | null

  setServerUrl: (url: string) => void
  /** Open the WebSocket stream for execId, resetting the fold seeded with
   *  nodeIds so every node starts `pending` until its own WorkerStarted arrives. */
  watch: (execId: string, nodeIds: string[]) => void
  /** POST /api/run, then watch() the execution id it returns. */
  run: (workflowRef: string, nodeIds: string[]) => Promise<void>
  disconnect: () => void
}

/** createLiveStore takes injectable transport deps so the store's own logic —
 *  resetting state, folding events, tearing down the prior stream — is unit
 *  tested without a real WebSocket or network call. useLive below is the one
 *  instance components use. */
export function createLiveStore(deps: LiveDeps = defaultDeps): UseBoundStore<StoreApi<LiveStoreState>> {
  return create<LiveStoreState>((set, get) => ({
    serverUrl: 'http://127.0.0.1:7676',
    live: emptyLive(),
    connected: false,
    error: null,
    stop: null,

    setServerUrl: (url) => set({ serverUrl: url }),

    watch: (execId, nodeIds) => {
      get().stop?.()
      const stop = deps.watchExecution(
        execId,
        {
          onEvent: (ev) => set((s) => ({ live: reduce(s.live, ev) })),
          onDone: () => set({ connected: false }),
        },
        { baseUrl: get().serverUrl },
      )
      set({ live: emptyLive(nodeIds), connected: true, error: null, stop })
    },

    run: async (workflowRef, nodeIds) => {
      set({ error: null })
      try {
        const execId = await deps.startRun(get().serverUrl, workflowRef)
        get().watch(execId, nodeIds)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    disconnect: () => {
      get().stop?.()
      set({ stop: null, connected: false })
    },
  }))
}

export const useLive = createLiveStore()

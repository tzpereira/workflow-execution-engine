// The live-execution store: wires liveClient's transport into core/live's pure
// reducer and exposes it to components. Kept separate from the workspace store
// (store.ts) on purpose — that store is the workflow *definition* being edited;
// this one is a *view* of an execution happening elsewhere, driven solely by
// the wee serve event stream (REQ-UI-02, PRIN-02). Neither reads the other.

import { create, type StoreApi, type UseBoundStore } from 'zustand'

import type { Audit, ExecutionSummary, Template } from './core/audit'
import { emptyLive, reduce, reduceAll, type LiveState } from './core/live'
import {
  fetchAudit as defaultFetchAudit,
  fetchExecutions as defaultFetchExecutions,
  fetchTemplates as defaultFetchTemplates,
  startRun as defaultStartRun,
  watchExecution as defaultWatchExecution,
} from './liveClient'

export interface LiveDeps {
  watchExecution: typeof defaultWatchExecution
  startRun: typeof defaultStartRun
  fetchAudit: typeof defaultFetchAudit
  fetchExecutions: typeof defaultFetchExecutions
  fetchTemplates: typeof defaultFetchTemplates
}

const defaultDeps: LiveDeps = {
  watchExecution: defaultWatchExecution,
  startRun: defaultStartRun,
  fetchAudit: defaultFetchAudit,
  fetchExecutions: defaultFetchExecutions,
  fetchTemplates: defaultFetchTemplates,
}

export interface LiveStoreState {
  serverUrl: string
  live: LiveState
  connected: boolean
  error: string | null
  stop: (() => void) | null
  /** The Inspector's source for Contract/resolved-context/artifact-content
   *  (REQ-UI-03/04) — null until the first successful fetch. */
  audit: Audit | null
  /** M1.14's history table source (GET /api/executions), newest first. */
  executions: ExecutionSummary[]
  executionsError: string | null
  /** M1.14's template gallery source (GET /api/templates). */
  templates: Template[]
  templatesError: string | null

  setServerUrl: (url: string) => void
  /** Open the WebSocket stream for execId, resetting the fold seeded with
   *  nodeIds so every node starts `pending` until its own WorkerStarted
   *  arrives. Also loads the audit response — once immediately (the frozen
   *  Workflow/Workers are available as soon as the run starts) and again once
   *  the stream closes (to pick up final artifact content/cost). */
  watch: (execId: string, nodeIds: string[]) => void
  /** POST /api/run, then watch() the execution id it returns. */
  run: (workflowRef: string, nodeIds: string[]) => Promise<void>
  /** GET /api/executions/{execId} on demand — watch() already calls this at
   *  the right moments; exposed for a manual refresh or inspecting an
   *  execution outside the current live stream. */
  loadAudit: (execId: string) => Promise<void>
  /** GET /api/executions for the history table. */
  loadExecutions: () => Promise<void>
  /** GET /api/templates for the template gallery. */
  loadTemplates: () => Promise<void>
  /** Load a past execution (from the History tab) into the same view the live
   *  stream feeds — the Timeline/Inspector/Metrics panels don't know or care
   *  whether `live` came from a WebSocket fold or a one-shot reduceAll over a
   *  finished run's own recorded events. Disconnects any active watch first:
   *  a historical load and a live watch are mutually exclusive views. */
  loadHistorical: (execId: string) => Promise<void>
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
    audit: null,
    executions: [],
    executionsError: null,
    templates: [],
    templatesError: null,

    setServerUrl: (url) => set({ serverUrl: url }),

    watch: (execId, nodeIds) => {
      get().stop?.()
      const stop = deps.watchExecution(
        execId,
        {
          onEvent: (ev) => set((s) => ({ live: reduce(s.live, ev) })),
          onDone: () => {
            set({ connected: false })
            void get().loadAudit(execId)
          },
        },
        { baseUrl: get().serverUrl },
      )
      set({ live: emptyLive(nodeIds), connected: true, error: null, stop, audit: null })
      void get().loadAudit(execId)
    },

    loadAudit: async (execId) => {
      try {
        const audit = await deps.fetchAudit(get().serverUrl, execId)
        set({ audit })
      } catch {
        // Best-effort: the WS stream (or a retry via onDone) already surfaces
        // failures for a run in progress — a transient audit-fetch error
        // (e.g. snapshot not yet flushed) is not fatal to watching it live.
      }
    },

    loadExecutions: async () => {
      try {
        const executions = await deps.fetchExecutions(get().serverUrl)
        set({ executions, executionsError: null })
      } catch (e) {
        set({ executionsError: e instanceof Error ? e.message : String(e) })
      }
    },

    loadHistorical: async (execId) => {
      get().stop?.()
      set({ stop: null, connected: false })
      try {
        const audit = await deps.fetchAudit(get().serverUrl, execId)
        const nodeIds = audit.workflow.nodes.map((n) => n.id)
        set({ audit, live: reduceAll(audit.events, nodeIds), error: null })
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    loadTemplates: async () => {
      try {
        const templates = await deps.fetchTemplates(get().serverUrl)
        set({ templates, templatesError: null })
      } catch (e) {
        set({ templatesError: e instanceof Error ? e.message : String(e) })
      }
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

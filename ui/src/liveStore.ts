// The live-execution store: wires liveClient's transport into core/live's pure
// reducer and exposes it to components. Kept separate from the workspace store
// (store.ts) on purpose — that store is the workflow *definition* being edited;
// this one is a *view* of an execution happening elsewhere, driven solely by
// the wee serve event stream (REQ-UI-02, PRIN-02). Neither reads the other.

import { create, type StoreApi, type UseBoundStore } from 'zustand'

import type { Audit, ExecutionSummary, Template } from './core/audit'
import { emptyLive, reduce, reduceAll, type LiveState } from './core/live'
import {
  cancelExecution as defaultCancelExecution,
  clearCache as defaultClearCache,
  fetchAudit as defaultFetchAudit,
  fetchExecutions as defaultFetchExecutions,
  fetchTemplates as defaultFetchTemplates,
  reexecuteExecution as defaultReexecuteExecution,
  retryExecution as defaultRetryExecution,
  startRun as defaultStartRun,
  watchExecution as defaultWatchExecution,
} from './liveClient'

export interface LiveDeps {
  watchExecution: typeof defaultWatchExecution
  startRun: typeof defaultStartRun
  fetchAudit: typeof defaultFetchAudit
  fetchExecutions: typeof defaultFetchExecutions
  fetchTemplates: typeof defaultFetchTemplates
  cancelExecution: typeof defaultCancelExecution
  retryExecution: typeof defaultRetryExecution
  reexecuteExecution: typeof defaultReexecuteExecution
  clearCache: typeof defaultClearCache
}

const defaultDeps: LiveDeps = {
  watchExecution: defaultWatchExecution,
  startRun: defaultStartRun,
  fetchAudit: defaultFetchAudit,
  fetchExecutions: defaultFetchExecutions,
  fetchTemplates: defaultFetchTemplates,
  cancelExecution: defaultCancelExecution,
  retryExecution: defaultRetryExecution,
  reexecuteExecution: defaultReexecuteExecution,
  clearCache: defaultClearCache,
}

export interface LiveStoreState {
  serverUrl: string
  tabs: RunTab[]
  activeTabId: string | null
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
  /** Wall-clock ms of the last event folded from the live stream — the liveness
   *  signal RunControls uses to show "still working (idle Ns)" for a long node
   *  that has not emitted an event yet (REQ-CTRL-06). null when nothing is
   *  being watched. */
  lastEventAt: number | null

  setServerUrl: (url: string) => void
  /** Open the WebSocket stream for execId, resetting the fold seeded with
   *  nodeIds so every node starts `pending` until its own WorkerStarted
   *  arrives. Also loads the audit response — once immediately (the frozen
   *  Workflow/Workers are available as soon as the run starts) and again once
   *  the stream closes (to pick up final artifact content/cost). */
  watch: (execId: string, nodeIds: string[]) => void
  /** POST /api/run, then watch() the execution id it returns. inputs supplies
   *  values for the workflow's declared Inputs (REQ-INPUT-01), collected by
   *  RunInputsModal before this is called; omit for a workflow with none. */
  run: (
    workflowRef: string,
    nodeIds: string[],
    inputs?: Record<string, string>,
  ) => Promise<void>
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
  /** Cancel the current execution (REQ-CTRL-03). The server cancels the run;
   *  the live stream closes on the resulting terminal event. */
  cancel: () => Promise<void>
  /** Resume/retry the current execution in place (REQ-CTRL-03/04): completed
   *  nodes are reused, the rest re-run. With `from`, that node and its
   *  downstream re-run too. Re-watches the same id so the new work streams in. */
  retry: (from?: string) => Promise<void>
  /** Re-execute the current execution's frozen workflow as a NEW execution
   *  (cache reuses unchanged nodes) and watch it (REQ-CTRL-03). */
  reexecute: () => Promise<void>
  /** Clear the current execution's cache — all its nodes, or one (REQ-CTRL-03).
   *  Refreshes the audit so the next retry/re-exec recomputes the cleared node. */
  clearNodeCache: (nodeId?: string) => Promise<void>
  switchTab: (id: string) => void
  closeTab: (id: string) => void
  disconnect: () => void
}

export interface RunTab {
  id: string
  label: string
  live: LiveState
  connected: boolean
  error: string | null
  stop: (() => void) | null
  audit: Audit | null
  lastEventAt: number | null
}

/** currentExecId is the execution the control actions operate on: the live
 *  stream's id if one is being watched, else the loaded audit's id. */
function currentExecId(s: LiveStoreState): string | null {
  return s.live.executionId || s.audit?.executionId || null
}

const emptyActive = {
  live: emptyLive(),
  connected: false,
  error: null,
  stop: null,
  audit: null,
  lastEventAt: null,
}

function activeFields(tabs: RunTab[], activeTabId: string | null) {
  const tab = tabs.find((t) => t.id === activeTabId)
  if (!tab) return emptyActive
  return {
    live: tab.live,
    connected: tab.connected,
    error: tab.error,
    stop: tab.stop,
    audit: tab.audit,
    lastEventAt: tab.lastEventAt,
  }
}

function makeTab(execId: string, nodeIds: string[], stop: () => void): RunTab {
  return {
    id: execId,
    label: execId.length > 12 ? `${execId.slice(0, 8)}…` : execId,
    live: emptyLive(nodeIds),
    connected: true,
    error: null,
    stop,
    audit: null,
    lastEventAt: Date.now(),
  }
}

/** createLiveStore takes injectable transport deps so the store's own logic —
 *  resetting state, folding events, tearing down the prior stream — is unit
 *  tested without a real WebSocket or network call. useLive below is the one
 *  instance components use. */
export function createLiveStore(
  deps: LiveDeps = defaultDeps,
): UseBoundStore<StoreApi<LiveStoreState>> {
  return create<LiveStoreState>((set, get) => ({
    serverUrl: 'http://127.0.0.1:7676',
    tabs: [],
    activeTabId: null,
    live: emptyLive(),
    connected: false,
    error: null,
    stop: null,
    audit: null,
    executions: [],
    executionsError: null,
    templates: [],
    templatesError: null,
    lastEventAt: null,

    setServerUrl: (url) => set({ serverUrl: url }),

    watch: (execId, nodeIds) => {
      const stop = deps.watchExecution(
        execId,
        {
          onEvent: (ev) =>
            set((s) => {
              const tabs = s.tabs.map((t) =>
                t.id === execId
                  ? { ...t, live: reduce(t.live, ev), lastEventAt: Date.now() }
                  : t,
              )
              return { tabs, ...activeFields(tabs, s.activeTabId) }
            }),
          onDone: () => {
            set((s) => {
              const tabs = s.tabs.map((t) =>
                t.id === execId ? { ...t, connected: false, stop: null } : t,
              )
              return { tabs, ...activeFields(tabs, s.activeTabId) }
            })
            void get().loadAudit(execId)
          },
        },
        { baseUrl: get().serverUrl },
      )
      set((s) => {
        const existing = s.tabs.find((t) => t.id === execId)
        existing?.stop?.()
        const next = makeTab(execId, nodeIds, stop)
        const tabs = existing
          ? s.tabs.map((t) => (t.id === execId ? next : t))
          : [...s.tabs, next]
        return { tabs, activeTabId: execId, ...activeFields(tabs, execId) }
      })
      void get().loadAudit(execId)
    },

    loadAudit: async (execId) => {
      try {
        const audit = await deps.fetchAudit(get().serverUrl, execId)
        set((s) => {
          if (!s.tabs.some((t) => t.id === execId)) {
            return { audit }
          }
          const tabs = s.tabs.map((t) =>
            t.id === execId ? { ...t, audit } : t,
          )
          return { tabs, ...activeFields(tabs, s.activeTabId) }
        })
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
      try {
        const audit = await deps.fetchAudit(get().serverUrl, execId)
        const nodeIds = audit.workflow.nodes.map((n) => n.id)
        const tab: RunTab = {
          id: execId,
          label: execId.length > 12 ? `${execId.slice(0, 8)}…` : execId,
          live: reduceAll(audit.events, nodeIds),
          connected: false,
          error: null,
          stop: null,
          audit,
          lastEventAt: null,
        }
        set((s) => {
          const tabs = s.tabs.some((t) => t.id === execId)
            ? s.tabs.map((t) => (t.id === execId ? tab : t))
            : [...s.tabs, tab]
          return { tabs, activeTabId: execId, ...activeFields(tabs, execId) }
        })
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

    run: async (workflowRef, nodeIds, inputs) => {
      set({ error: null })
      try {
        const execId = await deps.startRun(get().serverUrl, workflowRef, inputs)
        get().watch(execId, nodeIds)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    cancel: async () => {
      const id = currentExecId(get())
      if (!id) return
      try {
        await deps.cancelExecution(get().serverUrl, id)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    retry: async (from) => {
      const id = currentExecId(get())
      if (!id) return
      const nodeIds = get().audit?.workflow.nodes.map((n) => n.id) ?? []
      set({ error: null })
      try {
        await deps.retryExecution(get().serverUrl, id, from)
        get().watch(id, nodeIds)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    reexecute: async () => {
      const id = currentExecId(get())
      if (!id) return
      const nodeIds = get().audit?.workflow.nodes.map((n) => n.id) ?? []
      set({ error: null })
      try {
        const newId = await deps.reexecuteExecution(get().serverUrl, id)
        get().watch(newId, nodeIds)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    clearNodeCache: async (nodeId) => {
      const id = currentExecId(get())
      if (!id) return
      try {
        await deps.clearCache(get().serverUrl, { executionId: id, nodeId })
        await get().loadAudit(id)
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      }
    },

    switchTab: (id) =>
      set((s) => ({ activeTabId: id, ...activeFields(s.tabs, id) })),

    closeTab: (id) => {
      set((s) => {
        const closing = s.tabs.find((t) => t.id === id)
        closing?.stop?.()
        const tabs = s.tabs.filter((t) => t.id !== id)
        const activeTabId =
          s.activeTabId === id
            ? (tabs[tabs.length - 1]?.id ?? null)
            : s.activeTabId
        return { tabs, activeTabId, ...activeFields(tabs, activeTabId) }
      })
    },

    disconnect: () => {
      const id = get().activeTabId
      if (!id) return
      set((s) => {
        const tabs = s.tabs.map((t) => {
          if (t.id !== id) return t
          t.stop?.()
          return { ...t, stop: null, connected: false }
        })
        return { tabs, ...activeFields(tabs, s.activeTabId) }
      })
    },
  }))
}

export const useLive = createLiveStore()

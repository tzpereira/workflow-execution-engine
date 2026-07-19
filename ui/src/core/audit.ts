// The audit response: GET /api/executions/{id} (core/server's Audit, wrapping
// core/replay.Timeline). This is what the live event stream (core/live.ts)
// cannot carry — the frozen Workflow and its Workers (so a node's Goal and
// Contract render, REQ-UI-03), plus each node's actual artifact bytes
// (REQ-UI-04) — not just the hash/type ArtifactCreated puts on the wire.
//
// Two views of the same execution coexist deliberately (PRIN-02): `live.ts`
// folds the event stream into evolving per-node status for the Gantt/canvas;
// this module is the frozen-at-start-plus-final-artifacts complement the
// Inspector reads its "what did this Worker see, and what did it produce"
// answer from. Neither is a copy of the other — the audit response IS the
// server's replay.Timeline, byte-identical.

import type { Budget, Worker, Workflow } from './model'
import type { WFEvent } from './live'

export type NodeRecordState = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped'

/** NodeRecord mirrors core/replay.NodeRecord. Content is base64 (encoding/json's
 *  default for a Go []byte field) — decode with contentText/contentBytes below. */
export interface NodeRecord {
  state: NodeRecordState
  hash?: string
  type?: string
  content?: string
  costUsd?: number
  tokens?: number
  error?: string
}

/** Template mirrors core/server.Template — one row of GET /api/templates
 *  (M1.14's gallery): a `wee export` bundle's identity, nothing more (no
 *  UI-only/proprietary template format — the bundle IS the template). */
export interface Template {
  name: string
  workflowId: string
  version: string
  nodeCount: number
}

/** ImportedTemplate mirrors core/server.importTemplateResponse — POST
 *  /api/templates/{name}/import's response: where the unpacked files landed
 *  (for POST /api/run to resolve later) and the workflow itself, ready to
 *  hand straight to the workspace store's existing import path. */
export interface ImportedTemplate {
  workflowPath: string
  workflow: Workflow
}

/** ExecutionSummary mirrors core/server.ExecutionSummary — one row of GET
 *  /api/executions (M1.14's history table, REQ-METRIC-01/02). Cheap: no
 *  artifact bytes, just what the event log's ExecutionStarted/Finished and
 *  WorkerFinished events already carry. */
export interface ExecutionSummary {
  id: string
  workflow: string
  version: string
  state: string
  spentCostUsd: number
  spentTokens: number
  durationMs: number
}

/** Audit mirrors core/server.Audit (replay.Timeline plus the derived State). */
export interface Audit {
  executionId: string
  workflow: Workflow
  budget: Budget
  events: WFEvent[]
  nodes: Record<string, NodeRecord>
  spentCostUsd: number
  spentTokens: number
  definitionHashes?: Record<string, string>
  workers?: Record<string, Worker>
  state: string
}

/** contentText decodes a NodeRecord's base64 content as UTF-8 text — every
 *  artifact type the Inspector renders as text (Diff, Markdown, JSON, Code,
 *  TestResult, Report) goes through this. Returns undefined if there's no
 *  content yet (node pending/skipped) or it fails to decode. */
export function contentText(rec: NodeRecord | undefined): string | undefined {
  if (!rec?.content) return undefined
  try {
    return decodeURIComponent(escape(atob(rec.content)))
  } catch {
    return undefined
  }
}

/** contentDataURL builds a downloadable data: URL for a NodeRecord's raw
 *  bytes — the File artifact viewer's download link, and usable for any other
 *  type too (an image, an arbitrary Report). mimeType defaults to a generic
 *  binary type since domain.Artifact.mimeType isn't recorded on the wire yet
 *  (see core/domain/artifact.go — never actually populated at runtime). */
export function contentDataURL(rec: NodeRecord | undefined, mimeType = 'application/octet-stream'): string | undefined {
  if (!rec?.content) return undefined
  return `data:${mimeType};base64,${rec.content}`
}

/** contextHashesFor returns the artifact hashes a node's WorkerFinished event
 *  admitted as its resolved context (policy.Hashes, REQ-CTXPOL-03) — literally
 *  what the Worker saw, not a description of the policy. Empty if the node
 *  hasn't finished yet, was cached (no contextHashes recorded on that path —
 *  core/engine/node.go:236), or saw nothing (mode: none). */
export function contextHashesFor(audit: Audit, nodeId: string): string[] {
  const ev = audit.events.find((e) => e.type === 'WorkerFinished' && e.nodeId === nodeId)
  const hashes = ev?.payload?.contextHashes
  return Array.isArray(hashes) ? hashes.filter((h): h is string => typeof h === 'string') : []
}

/** nodeIdForHash finds which node in this execution produced a given artifact
 *  hash — how the Inspector resolves a context hash back to actual content:
 *  every hash a context policy can admit is some upstream node's own output,
 *  produced within the same execution and already in `audit.nodes`. */
export function nodeIdForHash(audit: Audit, hash: string): string | undefined {
  return Object.entries(audit.nodes).find(([, rec]) => rec.hash === hash)?.[0]
}

/** workerRef returns the "id@version" a node resolves to, or undefined for a
 *  tool-backed (or malformed) node — the key into Audit.workers. */
export function workerRef(audit: Audit, nodeId: string): string | undefined {
  return audit.workflow.nodes.find((n) => n.id === nodeId)?.worker
}

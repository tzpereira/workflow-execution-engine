// The canonical workflow model, mirroring core/domain (Go) field-for-field by
// its JSON tag names. This is the one shape the UI reads and writes; the canvas
// is a view over it, never a second source of truth (REQ-UI-01, PRIN-02).
//
// Positions and other canvas-only metadata live outside this model (see
// graph.ts) so they never leak into an exported definition — that is what keeps
// the round-trip drift-free.

export interface ModelConfig {
  provider: string
  model: string
  params?: Record<string, unknown>
}

// ContextPolicy mirrors core/domain.ContextPolicy (schemas/context-policy.schema.json)
// exactly: mode plus, for "artifacts" mode only, the upstream node ids to
// admit by producing-node identity (concepts/context-policy.md).
export interface ContextPolicy {
  mode: string
  params?: { artifacts?: string[] }
}

export interface Contract {
  goal: string
  rules: string[]
  outputSchema: Record<string, unknown>
  successCriteria: string[]
  maxRetries: number
}

export interface ToolCall {
  toolName: string
  input: Record<string, unknown>
}

export interface Condition {
  path: string
  op: string
  value?: unknown
}

export interface Edge {
  from: string
  to: string
  condition?: Condition
}

export interface FailurePolicy {
  mode: string
  fallbackNode?: string
}

export interface Node {
  id: string
  worker?: string
  tool?: ToolCall
  contextPolicy?: ContextPolicy
  onFailure?: FailurePolicy
}

export interface Defaults {
  model?: ModelConfig
  contextPolicy?: ContextPolicy
}

export interface Budget {
  maxCostUsd: number
  maxTokens: number
  maxDurationMs: number
  maxRetriesPerNode: number
}

// InputDecl mirrors core/domain.InputDecl — one named, string-valued run-time
// parameter a Workflow declares (REQ-INPUT-01). Required with no default means
// a run cannot start until a value is supplied (engine.resolveWorkflowInputs).
export interface InputDecl {
  name: string
  required?: boolean
  default?: string
  description?: string
}

export interface Workflow {
  id: string
  version: string
  nodes: Node[]
  edges: Edge[]
  defaults?: Defaults
  inputs?: InputDecl[]
  budget: Budget
}

// Worker mirrors core/domain.Worker — the full definition behind a node's
// `worker: "id@version"` reference. The engine pins the resolved Worker into
// an execution's snapshot at run start (REQ-VERSION-02), so the Inspector
// (M1.13, REQ-UI-03) reads it from the audit response, never a re-fetched
// *.worker.yaml file (see core/audit.ts's Audit.workers).
export interface Worker {
  id: string
  version: string
  objective: string
  constraints: string[]
  tools: string[]
  contextPolicy: ContextPolicy
  contract: Contract
  model: ModelConfig
}

/** A node is worker-backed or tool-backed — exactly one, matching the engine's
 *  graph rule (core/validate/graph.go). */
export function nodeKind(node: Node): 'worker' | 'tool' | 'invalid' {
  const hasWorker = typeof node.worker === 'string' && node.worker.length > 0
  const hasTool = node.tool != null
  if (hasWorker === hasTool) return 'invalid' // neither or both
  return hasWorker ? 'worker' : 'tool'
}

// A lightweight structural check of a workflow, mirroring the Go engine's graph
// rules (core/validate/graph.go): unique node ids, exactly one of worker/tool
// per node, and every edge endpoint resolving to a real node. It is a fast
// authoring-time check in the UI, not a replacement for the engine's full schema
// validation at run time.

import { nodeKind, type Workflow } from './model'

export function validateWorkflow(wf: Workflow): string[] {
  const problems: string[] = []
  const ids = new Set<string>()

  for (const n of wf.nodes) {
    if (ids.has(n.id)) problems.push(`duplicate node id "${n.id}"`)
    ids.add(n.id)
    if (nodeKind(n) === 'invalid') {
      problems.push(`node "${n.id}" must reference exactly one of a worker or a tool`)
    }
  }

  for (const e of wf.edges) {
    if (!ids.has(e.from)) problems.push(`edge references unknown source node "${e.from}"`)
    if (!ids.has(e.to)) problems.push(`edge references unknown target node "${e.to}"`)
  }

  return problems
}

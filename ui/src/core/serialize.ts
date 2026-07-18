// Read and write the canonical workflow format. Parsing is loss-free: the
// object the engine's YAML/JSON expresses is returned as-is (typed as Workflow),
// so a parse→serialize round-trip changes only formatting (key order,
// whitespace), never semantics — the REQ-UI-01 guarantee.

import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import type { Workflow } from './model'

export type Format = 'yaml' | 'json'

/** Choose a format from a file name's extension (defaults to YAML). */
export function formatForPath(path: string): Format {
  return path.endsWith('.json') ? 'json' : 'yaml'
}

/** Parse a workflow definition. No field is dropped or renamed — the parsed
 *  object is the model. Throws on malformed input. */
export function parseWorkflow(text: string, format: Format): Workflow {
  const raw = format === 'yaml' ? parseYaml(text) : JSON.parse(text)
  if (raw == null || typeof raw !== 'object') {
    throw new Error('workflow definition is not an object')
  }
  return raw as Workflow
}

/** Serialize a workflow back to text. YAML mirrors how the engine writes
 *  definitions; JSON is indented for readability. */
export function serializeWorkflow(wf: Workflow, format: Format): string {
  return format === 'yaml' ? stringifyYaml(wf) : JSON.stringify(wf, null, 2)
}

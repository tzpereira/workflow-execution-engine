// The UI's forms are generated from the engine's canonical JSON Schemas — the
// exact files core/validate compiles (imported via the @schemas alias), never a
// hand-copied field list (REQ-UI-01). @rjsf/ajv doesn't follow the schemas'
// cross-file `$ref` URLs on its own, so we inline them here into standalone,
// self-contained schemas — small enough to do by hand and unit-test, no
// ref-resolver dependency.

import budgetSchema from '@schemas/budget.schema.json'
import contextPolicySchema from '@schemas/context-policy.schema.json'
import contractSchema from '@schemas/contract.schema.json'
import workerSchema from '@schemas/worker.schema.json'

export type JSONSchema = Record<string, unknown>

// Every schema the UI might reference, keyed by its canonical $id.
const registry: Record<string, JSONSchema> = {
  'https://wee.dev/schemas/budget.schema.json': budgetSchema as JSONSchema,
  'https://wee.dev/schemas/context-policy.schema.json': contextPolicySchema as JSONSchema,
  'https://wee.dev/schemas/contract.schema.json': contractSchema as JSONSchema,
  'https://wee.dev/schemas/worker.schema.json': workerSchema as JSONSchema,
}

/** dereference returns a copy of schema with every `{ $ref: <known-$id> }`
 *  replaced by the referenced schema (recursively), and `$id`/`$schema` stripped
 *  from every level so the inlined result registers cleanly with one ajv
 *  instance. A cycle (none exist in these schemas) is broken by the seen set. */
export function dereference(schema: JSONSchema, seen: Set<string> = new Set()): JSONSchema {
  const ref = schema['$ref']
  if (typeof ref === 'string' && registry[ref] && !seen.has(ref)) {
    return dereference(registry[ref], new Set(seen).add(ref))
  }

  const out: JSONSchema = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$id' || key === '$schema' || key === '$ref') continue
    out[key] = derefValue(value, seen)
  }
  return out
}

function derefValue(value: unknown, seen: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((v) => derefValue(v, seen))
  if (value != null && typeof value === 'object') {
    return dereference(value as JSONSchema, seen)
  }
  return value
}

/** Ready-to-use, fully-inlined schemas for the forms. */
export const budget = dereference(registry['https://wee.dev/schemas/budget.schema.json'])
export const worker = dereference(registry['https://wee.dev/schemas/worker.schema.json'])

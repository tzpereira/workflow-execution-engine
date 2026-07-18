import { describe, expect, it } from 'vitest'

import { budget, worker } from './schemas'

// Confirms the forms are wired to the real engine schemas (imported, not
// hand-copied) and that cross-file $refs are inlined so no unresolved reference
// reaches the form renderer.
describe('schema dereferencing', () => {
  it('budget schema exposes the engine budget fields', () => {
    const props = budget.properties as Record<string, unknown>
    expect(Object.keys(props).sort()).toEqual([
      'maxCostUsd',
      'maxDurationMs',
      'maxRetriesPerNode',
      'maxTokens',
    ])
  })

  it('worker schema inlines its contract and contextPolicy $refs (none left unresolved)', () => {
    const json = JSON.stringify(worker)
    expect(json).not.toContain('$ref')
    expect(json).not.toContain('$id')
    // The contract sub-schema was inlined, bringing its own fields in.
    const props = worker.properties as Record<string, Record<string, unknown>>
    expect(props.contract.type).toBe('object')
    expect((props.contract.properties as Record<string, unknown>).outputSchema).toBeDefined()
    expect(props.contextPolicy.type).toBe('object')
  })
})

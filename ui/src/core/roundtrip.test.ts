import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { fromGraph, metaOf, toGraph } from './graph'
import { parseWorkflow, serializeWorkflow } from './serialize'
import type { Workflow } from './model'

// A workflow exercising every field that must survive a round-trip: worker and
// tool nodes, a conditional edge, defaults, and a full budget.
const sampleYAML = `id: pr-review
version: 1.0.0
nodes:
  - id: review
    worker: reviewer@1.0.0
  - id: fix
    worker: fixer@1.0.0
    onFailure:
      mode: continue
  - id: test
    tool:
      toolName: terminal
      input:
        command: go
        args:
          - test
          - ./...
edges:
  - from: review
    to: fix
    condition:
      path: verdict
      op: eq
      value: request-changes
  - from: fix
    to: test
defaults:
  contextPolicy:
    mode: parent-only
budget:
  maxCostUsd: 0.5
  maxTokens: 20000
  maxDurationMs: 120000
  maxRetriesPerNode: 2
`

// TestCanvasRoundTripIsSemanticallyIdentical is the REQ-UI-01 heart: a workflow
// pushed through the canvas mapping (model → graph → model) is byte-for-byte the
// same model. Positions the canvas adds never leak back into the definition.
describe('canvas round-trip', () => {
  it('model → graph → model is identity', () => {
    const wf = parseWorkflow(sampleYAML, 'yaml')
    const back = fromGraph(toGraph(wf), metaOf(wf))
    expect(back).toEqual(wf)
  })

  it('parse → serialize → parse preserves semantics (drift is formatting only)', () => {
    const wf = parseWorkflow(sampleYAML, 'yaml')
    const reparsed = parseWorkflow(serializeWorkflow(wf, 'yaml'), 'yaml')
    expect(reparsed).toEqual(wf)
  })

  it('a full import → canvas → export → import cycle is lossless', () => {
    const wf = parseWorkflow(sampleYAML, 'yaml')
    const exported = serializeWorkflow(fromGraph(toGraph(wf), metaOf(wf)), 'yaml')
    expect(parseWorkflow(exported, 'yaml')).toEqual(wf)
  })

  it('leaves a readable routing gutter between imported workflow layers', () => {
    const graph = toGraph(parseWorkflow(sampleYAML, 'yaml'))
    const x = Object.fromEntries(graph.nodes.map((node) => [node.id, node.position.x]))

    expect(x.fix - x.review).toBe(360)
    expect(x.test - x.fix).toBe(360)
  })
})

// TestShippedExampleSurvivesRoundTrip runs the actual pr-review example the Go
// engine ships and validates against, through the full canvas cycle — the
// cross-tool guarantee that a wee-authored YAML imports and re-exports cleanly.
describe('shipped example', () => {
  // vitest runs with cwd at ui/, so the repo's examples/ is one level up.
  const path = resolve(process.cwd(), '../examples/pr-review/workflow.yaml')

  it('imports, round-trips through the canvas, and re-exports identically', () => {
    const original = parseWorkflow(readFileSync(path, 'utf8'), 'yaml') as Workflow
    const exported = serializeWorkflow(
      fromGraph(toGraph(original), metaOf(original)),
      'yaml',
    )
    expect(parseWorkflow(exported, 'yaml')).toEqual(original)
  })
})

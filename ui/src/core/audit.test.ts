import { describe, expect, it } from 'vitest'

import type { Audit } from './audit'
import {
  contentDataURL,
  contentText,
  contextHashesFor,
  nodeIdForHash,
  resolvedModelIdentity,
  resolvedToolVersion,
  workerRef,
} from './audit'

function baseAudit(overrides: Partial<Audit> = {}): Audit {
  return {
    executionId: 'exec-1',
    workflow: {
      id: 'wf',
      version: '1.0.0',
      nodes: [
        { id: 'review', worker: 'reviewer@1.0.0' },
        { id: 'fix', worker: 'fixer@1.0.0' },
      ],
      edges: [],
      budget: {
        maxCostUsd: 0,
        maxTokens: 0,
        maxDurationMs: 0,
        maxRetriesPerNode: 0,
      },
    },
    budget: {
      maxCostUsd: 0,
      maxTokens: 0,
      maxDurationMs: 0,
      maxRetriesPerNode: 0,
    },
    events: [],
    nodes: {},
    spentCostUsd: 0,
    spentTokens: 0,
    state: 'succeeded',
    ...overrides,
  }
}

describe('contentText', () => {
  it('decodes base64 UTF-8 content, including non-ASCII', () => {
    const b64 = btoa(unescape(encodeURIComponent('{"ok":true,"emoji":"✅"}')))
    expect(contentText({ state: 'succeeded', content: b64 })).toBe(
      '{"ok":true,"emoji":"✅"}',
    )
  })

  it('returns undefined when there is no content', () => {
    expect(contentText({ state: 'pending' })).toBeUndefined()
    expect(contentText(undefined)).toBeUndefined()
  })

  it('returns undefined rather than throwing on undecodable content', () => {
    expect(
      contentText({ state: 'succeeded', content: 'not-valid-base64!!' }),
    ).toBeUndefined()
  })
})

describe('contentDataURL', () => {
  it('builds a data: URL with the given mime type', () => {
    expect(
      contentDataURL({ state: 'succeeded', content: 'aGVsbG8=' }, 'text/plain'),
    ).toBe('data:text/plain;base64,aGVsbG8=')
  })

  it('defaults to a generic binary mime type', () => {
    expect(contentDataURL({ state: 'succeeded', content: 'aGVsbG8=' })).toBe(
      'data:application/octet-stream;base64,aGVsbG8=',
    )
  })

  it('returns undefined when there is no content', () => {
    expect(contentDataURL({ state: 'pending' })).toBeUndefined()
  })
})

describe('contextHashesFor', () => {
  it("reads contextHashes off the node's WorkerFinished event payload", () => {
    const audit = baseAudit({
      events: [
        {
          type: 'WorkerFinished',
          timestamp: 't',
          executionId: 'exec-1',
          nodeId: 'fix',
          prevHash: 'x',
          payload: { contextHashes: ['h1', 'h2'] },
        },
      ],
    })
    expect(contextHashesFor(audit, 'fix')).toEqual(['h1', 'h2'])
  })

  it('is empty when the node has not finished, was cached, or saw nothing', () => {
    const audit = baseAudit({
      events: [
        {
          type: 'WorkerFinished',
          timestamp: 't',
          executionId: 'exec-1',
          nodeId: 'fix',
          prevHash: 'x',
          payload: {},
        },
      ],
    })
    expect(contextHashesFor(audit, 'fix')).toEqual([])
    expect(contextHashesFor(audit, 'review')).toEqual([])
  })
})

describe('nodeIdForHash', () => {
  it('finds which node produced a given artifact hash', () => {
    const audit = baseAudit({
      nodes: { review: { state: 'succeeded', hash: 'abc123' } },
    })
    expect(nodeIdForHash(audit, 'abc123')).toBe('review')
    expect(nodeIdForHash(audit, 'nope')).toBeUndefined()
  })
})

describe('workerRef', () => {
  it("returns a node's worker reference", () => {
    expect(workerRef(baseAudit(), 'review')).toBe('reviewer@1.0.0')
  })

  it('is undefined for an unknown node', () => {
    expect(workerRef(baseAudit(), 'ghost')).toBeUndefined()
  })
})

describe('resolved execution identity', () => {
  it('uses the frozen Worker and connection reference for model identity (REQ-UI-19)', () => {
    const audit = baseAudit({
      workers: {
        'reviewer@1.0.0': {
          id: 'reviewer',
          version: '1.0.0',
          description: 'Frozen reviewer',
          objective: 'review',
          constraints: [],
          tools: [],
          contextPolicy: { mode: 'diff-only' },
          contract: {
            goal: 'review',
            rules: [],
            outputSchema: { type: 'object' },
            successCriteria: [],
            maxRetries: 1,
          },
          model: { provider: 'kimi-prod', model: 'kimi-k2.6' },
        },
      },
      connectionRefs: {
        'kimi-prod': {
          id: 'kimi-prod',
          label: 'Kimi production',
          kind: 'model-provider',
          type: 'openai-compatible',
          baseUrl: 'https://api.moonshot.ai/v1',
        },
      },
    })

    expect(resolvedModelIdentity(audit, 'review')).toMatchObject({
      provider: 'kimi-prod',
      model: 'kimi-k2.6',
      worker: { description: 'Frozen reviewer' },
      connection: { type: 'openai-compatible' },
    })
  })

  it('reads a deterministic tool version from its recorded invocation', () => {
    const audit = baseAudit({
      workflow: {
        ...baseAudit().workflow,
        nodes: [{ id: 'test', tool: { toolName: 'terminal', input: {} } }],
      },
      events: [
        {
          type: 'ToolCalled',
          timestamp: 't',
          executionId: 'exec-1',
          nodeId: 'test',
          prevHash: 'x',
          payload: { tool: 'terminal', version: '1.0.0' },
        },
      ],
    })
    expect(resolvedToolVersion(audit, 'test')).toBe('1.0.0')
  })
})

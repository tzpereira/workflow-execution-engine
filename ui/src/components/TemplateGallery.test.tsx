import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Template } from '../core/audit'
import * as liveClient from '../liveClient'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { TemplateGallery } from './TemplateGallery'

function resetStores() {
  useLive.getState().disconnect()
  useLive.setState({
    templates: [],
    templatesError: null,
    serverUrl: 'http://127.0.0.1:7676',
  })
  useWorkspace.setState({
    meta: {
      id: 'untitled',
      version: '0.1.0',
      budget: {
        maxCostUsd: 0,
        maxTokens: 0,
        maxDurationMs: 0,
        maxRetriesPerNode: 0,
      },
    },
    nodes: [],
    edges: [],
    selectedNodeId: null,
    fileName: null,
    error: null,
  })
}

describe('TemplateGallery', () => {
  beforeEach(() => {
    resetStores()
    vi.restoreAllMocks()
  })

  it('renders nothing when closed', () => {
    render(<TemplateGallery open={false} onOpenChange={() => {}} />)
    expect(screen.queryByText('Templates')).not.toBeInTheDocument()
  })

  it('loads the small ready-to-run template catalog', () => {
    useLive.setState({
      templates: [
        {
          name: 'pr-review',
          workflowId: 'pr-review',
          version: '1.1.0',
          nodeCount: 2,
          requiredConnections: ['openai'],
          tools: ['http'],
          writeCapable: false,
          expectedCostUsd: 0.03,
          expectedDurationMs: 90000,
          inputs: [
            {
              name: 'prUrl',
              required: true,
              description: 'PR diff URL',
              default: '',
            },
          ],
        },
      ],
    })
    render(<TemplateGallery open onOpenChange={() => {}} />)

    expect(screen.getByText('pr-review')).toBeInTheDocument()
    expect(screen.getByText('2 nodes')).toBeInTheDocument()
    expect(screen.getByText('read-only')).toBeInTheDocument()
    expect(screen.getByText('≤ $0.03')).toBeInTheDocument()
    expect(screen.getByText('≤ 90s')).toBeInTheDocument()
    expect(screen.getByText('http')).toBeInTheDocument()
    expect(screen.getByText('connections: openai')).toBeInTheDocument()
    expect(screen.getByText('prUrl')).toBeInTheDocument()
    expect(screen.getByText('required')).toBeInTheDocument()
    expect(screen.getByText(/PR diff URL/)).toBeInTheDocument()
  })

  it('renders without crashing when tools/inputs arrive as null (server contract drift)', () => {
    // Regression: a nil Go slice marshals to JSON `null`, not `[]` — caught
    // live when refactor-plan (no declared inputs) round-tripped through a
    // real GET /api/templates as "inputs": null before core/registry's
    // DeriveTemplateFacts was fixed to always return non-nil slices. The
    // client stays defensive even though the server is now fixed.
    useLive.setState({
      templates: [
        {
          name: 'refactor-plan',
          workflowId: 'refactor-plan',
          version: '1.0.0',
          nodeCount: 2,
          tools: null as unknown as string[],
          writeCapable: false,
          expectedCostUsd: 0.03,
          expectedDurationMs: 90000,
          inputs: null as unknown as Template['inputs'],
        },
      ],
    })
    render(<TemplateGallery open onOpenChange={() => {}} />)

    expect(screen.getByText('refactor-plan')).toBeInTheDocument()
    expect(screen.getByText('no tools')).toBeInTheDocument()
  })

  it('shows a write-capable badge for a template with a write-capable tool call', () => {
    useLive.setState({
      templates: [
        {
          name: 'bug-investigation',
          workflowId: 'bug-investigation',
          version: '1.0.0',
          nodeCount: 5,
          tools: ['filesystem', 'terminal'],
          writeCapable: true,
          expectedCostUsd: 0.3,
          expectedDurationMs: 120000,
          inputs: [],
        },
      ],
    })
    render(<TemplateGallery open onOpenChange={() => {}} />)

    expect(screen.getByText('write-capable')).toBeInTheDocument()
    expect(screen.getByText('filesystem, terminal')).toBeInTheDocument()
  })

  it('shows a placeholder when no templates are configured', () => {
    render(<TemplateGallery open onOpenChange={() => {}} />)
    expect(screen.getByText(/No templates configured/)).toBeInTheDocument()
  })

  it('clicking a card imports the template into the workspace and closes the gallery', async () => {
    useLive.setState({
      templates: [
        {
          name: 'pr-review-autofix',
          workflowId: 'pr-review-autofix',
          version: '1.0.0',
          nodeCount: 1,
          requiredConnections: ['openai'],
          tools: ['filesystem', 'git', 'http', 'terminal'],
          writeCapable: true,
          expectedCostUsd: 0.5,
          expectedDurationMs: 180000,
          inputs: [
            {
              name: 'prUrl',
              required: true,
              description: 'GitHub PR API URL',
              default: '',
            },
          ],
        },
      ],
    })
    vi.spyOn(liveClient, 'importTemplate').mockResolvedValue({
      workflowPath: 'pr-review-autofix/workflow.yaml',
      workflow: {
        id: 'pr-review-autofix',
        version: '1.0.0',
        nodes: [{ id: 'review', worker: 'reviewer@1.0.0' }],
        edges: [],
        budget: {
          maxCostUsd: 0,
          maxTokens: 0,
          maxDurationMs: 0,
          maxRetriesPerNode: 0,
        },
      },
    })
    const onOpenChange = vi.fn()
    render(<TemplateGallery open onOpenChange={onOpenChange} />)

    expect(screen.getByText('write-capable')).toBeInTheDocument()
    expect(screen.getByText('connections: openai')).toBeInTheDocument()
    expect(screen.getByText('prUrl')).toBeInTheDocument()
    fireEvent.click(screen.getByText('pr-review-autofix'))

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(useWorkspace.getState().meta.id).toBe('pr-review-autofix')
    expect(useWorkspace.getState().nodes.map((n) => n.id)).toEqual(['review'])
    expect(useWorkspace.getState().fileName).toBe(
      'pr-review-autofix/workflow.yaml',
    )
  })

  it('shows an error and keeps the gallery open when the import fails', async () => {
    useLive.setState({
      templates: [
        {
          name: 'pr-review-autofix',
          workflowId: 'pr-review-autofix',
          version: '1.0.0',
          nodeCount: 1,
          tools: [],
          writeCapable: false,
          expectedCostUsd: 0,
          expectedDurationMs: 0,
          inputs: [],
        },
      ],
    })
    vi.spyOn(liveClient, 'importTemplate').mockRejectedValue(
      new Error('unknown template'),
    )
    const onOpenChange = vi.fn()
    render(<TemplateGallery open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('pr-review-autofix'))

    await vi.waitFor(() =>
      expect(screen.getByText('unknown template')).toBeInTheDocument(),
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('clicking outside (the backdrop) closes the gallery', () => {
    const onOpenChange = vi.fn()
    const { container } = render(
      <TemplateGallery open onOpenChange={onOpenChange} />,
    )
    fireEvent.click(container.firstElementChild!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

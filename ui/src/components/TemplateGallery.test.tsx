import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as liveClient from '../liveClient'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'
import { TemplateGallery } from './TemplateGallery'

function resetStores() {
  useLive.getState().disconnect()
  useLive.setState({ templates: [], templatesError: null, serverUrl: 'http://127.0.0.1:7676' })
  useWorkspace.setState({
    meta: { id: 'untitled', version: '0.1.0', budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 } },
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

  it('loads templates on open and renders a card per template', () => {
    useLive.setState({
      templates: [
        { name: 'pr-review-autofix', workflowId: 'pr-review-autofix', version: '1.0.0', nodeCount: 8 },
        { name: 'bug-investigation', workflowId: 'bug-investigation', version: '1.0.0', nodeCount: 7 },
      ],
    })
    render(<TemplateGallery open onOpenChange={() => {}} />)

    expect(screen.getByText('pr-review-autofix')).toBeInTheDocument()
    expect(screen.getByText('bug-investigation')).toBeInTheDocument()
    expect(screen.getByText('8 nodes')).toBeInTheDocument()
    expect(screen.getByText('7 nodes')).toBeInTheDocument()
  })

  it('shows a placeholder when no templates are configured', () => {
    render(<TemplateGallery open onOpenChange={() => {}} />)
    expect(screen.getByText(/No templates configured/)).toBeInTheDocument()
  })

  it('clicking a card imports the template into the workspace and closes the gallery', async () => {
    useLive.setState({
      templates: [{ name: 'pr-review-autofix', workflowId: 'pr-review-autofix', version: '1.0.0', nodeCount: 1 }],
    })
    vi.spyOn(liveClient, 'importTemplate').mockResolvedValue({
      workflowPath: 'pr-review-autofix/workflow.yaml',
      workflow: {
        id: 'pr-review-autofix',
        version: '1.0.0',
        nodes: [{ id: 'review', worker: 'reviewer@1.0.0' }],
        edges: [],
        budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 },
      },
    })
    const onOpenChange = vi.fn()
    render(<TemplateGallery open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('pr-review-autofix'))

    await vi.waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(useWorkspace.getState().meta.id).toBe('pr-review-autofix')
    expect(useWorkspace.getState().nodes.map((n) => n.id)).toEqual(['review'])
    expect(useWorkspace.getState().fileName).toBe('pr-review-autofix/workflow.yaml')
  })

  it('shows an error and keeps the gallery open when the import fails', async () => {
    useLive.setState({
      templates: [{ name: 'pr-review-autofix', workflowId: 'pr-review-autofix', version: '1.0.0', nodeCount: 1 }],
    })
    vi.spyOn(liveClient, 'importTemplate').mockRejectedValue(new Error('unknown template'))
    const onOpenChange = vi.fn()
    render(<TemplateGallery open onOpenChange={onOpenChange} />)

    fireEvent.click(screen.getByText('pr-review-autofix'))

    await vi.waitFor(() => expect(screen.getByText('unknown template')).toBeInTheDocument())
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('clicking outside (the backdrop) closes the gallery', () => {
    const onOpenChange = vi.fn()
    const { container } = render(<TemplateGallery open onOpenChange={onOpenChange} />)
    fireEvent.click(container.firstElementChild!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

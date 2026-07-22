import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWorkspace } from '../store'
import { CommandPalette } from './CommandPalette'

describe('CommandPalette', () => {
  beforeEach(() => {
    const meta = { id: 'untitled', version: '0.1.0', budget: { maxCostUsd: 0, maxTokens: 0, maxDurationMs: 0, maxRetriesPerNode: 0 } }
    useWorkspace.setState({
      meta,
      nodes: [{ id: 'review', position: { x: 0, y: 0 }, data: { node: { id: 'review', worker: 'reviewer@1.0.0' } } }],
      edges: [],
      selectedNodeId: null,
      fileName: 'workflow.yaml',
      error: null,
      activeDocumentId: 'untitled',
      documents: [{ id: 'untitled', label: 'workflow.yaml', meta, nodes: [], edges: [], fileName: 'workflow.yaml', dirty: false }],
    })
  })

  it('exposes primary workflow, workspace, theme, and jump actions', () => {
    render(
      <CommandPalette
        open
        onOpenChange={() => {}}
        onOpenTemplates={vi.fn()}
        onOpenSettings={vi.fn()}
        onOpenHelp={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    )

    expect(screen.getByText('Run workflow')).toBeInTheDocument()
    expect(screen.getByText('Open templates')).toBeInTheDocument()
    expect(screen.getByText('Open settings')).toBeInTheDocument()
    expect(screen.getByText('Toggle theme')).toBeInTheDocument()
    expect(screen.getByText('review')).toBeInTheDocument()
  })
})

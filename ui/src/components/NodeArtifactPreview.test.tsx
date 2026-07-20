import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { NodeRecord } from '../core/audit'
import { NodeArtifactPreview } from './NodeArtifactPreview'

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

function record(type: string, text: string): NodeRecord {
  return { state: 'succeeded', hash: 'abc123', type, content: b64(text) }
}

describe('NodeArtifactPreview', () => {
  it('renders nothing when the node has no artifact yet', () => {
    const { container } = render(<NodeArtifactPreview record={{ state: 'pending' }} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a truncated snippet and an expand affordance', () => {
    render(<NodeArtifactPreview record={record('json', '{"a":1}\n{"b":2}\n{"c":3}\n{"d":4}\n{"e":5}')} />)
    expect(screen.getByText(/"a":1/)).toBeInTheDocument()
    expect(screen.queryByText(/"e":5/)).not.toBeInTheDocument() // beyond the 3-line preview cap
    expect(screen.getByText('expand ⤢')).toBeInTheDocument()
  })

  it('opens a modal with the full ArtifactViewer on expand, closes on backdrop click', () => {
    render(<NodeArtifactPreview record={record('json', '{"a":1}')} />)
    expect(screen.queryByText('close')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('expand ⤢'))
    expect(screen.getByText('close')).toBeInTheDocument()
    // The full ArtifactViewer's own JSON tree renders here too — same
    // component, not a re-implementation.
    expect(screen.getByText('a:')).toBeInTheDocument()

    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByText('close')).not.toBeInTheDocument()
  })
})

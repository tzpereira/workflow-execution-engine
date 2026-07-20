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
    const { container } = render(
      <NodeArtifactPreview record={{ state: 'pending' }} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('shows a truncated snippet and an expand affordance', () => {
    const longJSON = JSON.stringify({ a: 'x'.repeat(230), e: 5 })
    render(<NodeArtifactPreview record={record('json', longJSON)} />)
    expect(screen.getByText(/"a"/)).toBeInTheDocument()
    expect(screen.queryByText(/"e":5/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Expand output' }),
    ).toBeInTheDocument()
  })

  it('summarizes an HTTP artifact without rendering its body', () => {
    render(
      <NodeArtifactPreview
        record={record(
          'json',
          JSON.stringify({
            status: 200,
            body: 'diff --git a/a b/a\n@@ -1 +1 @@\n-old\n+new',
          }),
        )}
      />,
    )
    expect(screen.getByText('HTTP 200')).toBeInTheDocument()
    expect(screen.getByText('4 lines')).toBeInTheDocument()
    expect(screen.queryByText(/diff --git/)).not.toBeInTheDocument()
  })

  it('summarizes a review artifact as verdict, score, and finding count', () => {
    render(
      <NodeArtifactPreview
        record={record(
          'json',
          JSON.stringify({
            verdict: 'request-changes',
            score: 78,
            issues: [
              {
                severity: 'major',
                line: 42,
                message: 'State can be lost here.',
              },
            ],
          }),
        )}
      />,
    )
    expect(screen.getByText('request-changes')).toBeInTheDocument()
    expect(screen.getByText('78/100')).toBeInTheDocument()
    expect(screen.getByText('1 finding')).toBeInTheDocument()
    expect(screen.getByText('State can be lost here.')).toBeInTheDocument()
  })

  it('opens a modal with the full ArtifactViewer on expand, closes on backdrop click', () => {
    render(<NodeArtifactPreview record={record('json', '{"a":1}')} />)
    expect(screen.queryByText('close')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expand output' }))
    expect(screen.getByText('close')).toBeInTheDocument()
    // The full ArtifactViewer's own JSON tree renders here too — same
    // component, not a re-implementation.
    expect(screen.getByText('a:')).toBeInTheDocument()

    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByText('close')).not.toBeInTheDocument()
  })
})

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { NodeRecord } from '../core/audit'
import { ArtifactViewer } from './ArtifactViewer'

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

function record(type: string, text: string, extra: Partial<NodeRecord> = {}): NodeRecord {
  return { state: 'succeeded', hash: 'abc123', type, content: b64(text), ...extra }
}

describe('ArtifactViewer', () => {
  it('shows a placeholder when there is no artifact yet', () => {
    render(<ArtifactViewer record={{ state: 'pending' }} />)
    expect(screen.getByText('no artifact yet')).toBeInTheDocument()
  })

  it('renders a JSON artifact as a tree by default, with a raw toggle', () => {
    render(<ArtifactViewer record={record('json', '{"score":90,"issues":[]}')} />)
    expect(screen.getByText('score:')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'raw' }))
    expect(screen.getByText(/"score": 90/)).toBeInTheDocument()
  })

  it('sanitizes Markdown/Report content through marked + DOMPurify (no script execution)', () => {
    render(<ArtifactViewer record={record('markdown', '# Title\n\n<script>window.__xss = true</script>\n\nbody')} />)
    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    expect((window as unknown as { __xss?: boolean }).__xss).toBeUndefined()
  })

  it('parses a unified diff into hunks', () => {
    const diff = [
      'diff --git a/a.txt b/a.txt',
      'index e69de29..4b825dc 100644',
      '--- a/a.txt',
      '+++ b/a.txt',
      '@@ -1 +1,2 @@',
      '-old line',
      '+new line',
      '+second line',
      '',
    ].join('\n')
    render(<ArtifactViewer record={record('diff', diff)} />)
    expect(screen.getByText(/new line/)).toBeInTheDocument()
  })

  it('does not crash on diff content that is not a well-formed unified diff', () => {
    // gitdiff-parser (react-diff-view's parser) is lenient rather than
    // throwing on garbage input; the component's try/catch exists for inputs
    // that do throw. Either way, rendering must not crash the Inspector.
    expect(() => render(<ArtifactViewer record={record('diff', 'not a real diff')} />)).not.toThrow()
  })

  it('renders a TestResult artifact\'s pass/fail summary', () => {
    render(<ArtifactViewer record={record('test-result', JSON.stringify({ passed: false, summary: '2 failed', output: 'FAIL foo_test.go' }))} />)
    expect(screen.getByText('fail')).toBeInTheDocument()
    expect(screen.getByText('2 failed')).toBeInTheDocument()
    expect(screen.getByText('FAIL foo_test.go')).toBeInTheDocument()
  })

  it('renders a File artifact as a download link', () => {
    render(<ArtifactViewer record={record('file', 'binary-ish content')} />)
    const link = screen.getByRole('link', { name: 'download' })
    expect(link).toHaveAttribute('download', 'abc123')
    expect(link.getAttribute('href')).toMatch(/^data:application\/octet-stream;base64,/)
  })

  it('falls back to a raw view for an unrecognized artifact type', () => {
    render(<ArtifactViewer record={record('mystery-type', 'plain content')} />)
    expect(screen.getByText('plain content')).toBeInTheDocument()
  })
})

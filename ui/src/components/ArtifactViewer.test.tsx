import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { NodeRecord } from '../core/audit'
import { ArtifactViewer } from './ArtifactViewer'

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

function record(
  type: string,
  text: string,
  extra: Partial<NodeRecord> = {},
): NodeRecord {
  return {
    state: 'succeeded',
    hash: 'abc123',
    type,
    content: b64(text),
    ...extra,
  }
}

describe('ArtifactViewer', () => {
  it('shows a placeholder when there is no artifact yet', () => {
    render(<ArtifactViewer record={{ state: 'pending' }} />)
    expect(screen.getByText('no artifact yet')).toBeInTheDocument()
  })

  it('renders a JSON artifact as a tree by default, with a raw toggle', () => {
    render(
      <ArtifactViewer record={record('json', '{"count":90,"items":[]}')} />,
    )
    expect(screen.getByText('count:')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'raw' }))
    expect(screen.getByText(/"count": 90/)).toBeInTheDocument()
  })

  it('renders a review result as a verdict and findings instead of a JSON tree', () => {
    render(
      <ArtifactViewer
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
    expect(screen.getByText('major')).toBeInTheDocument()
    expect(screen.getByText('L42')).toBeInTheDocument()
    expect(screen.getByText('State can be lost here.')).toBeInTheDocument()
    expect(screen.queryByText('verdict:')).not.toBeInTheDocument()
  })

  it('summarizes an HTTP response and reveals its bounded body on demand', () => {
    render(
      <ArtifactViewer
        record={record(
          'json',
          JSON.stringify({ status: 200, body: 'hello\nworld' }),
        )}
      />,
    )
    expect(screen.getByText('HTTP 200')).toBeInTheDocument()
    expect(screen.getByText('2 lines')).toBeInTheDocument()
    expect(screen.queryByText(/hello/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'View body' }))
    expect(screen.getByText(/hello/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Hide body' }),
    ).toBeInTheDocument()
  })

  it('renders generated code with its language, path, and summary', () => {
    render(
      <ArtifactViewer
        record={record(
          'json',
          JSON.stringify({
            language: 'go',
            path: 'pkg/widget_test.go',
            code: 'func TestWidget(t *testing.T) {}',
            summary: 'Covers the primary widget behavior.',
          }),
        )}
      />,
    )
    expect(screen.getAllByText('go').length).toBeGreaterThan(0)
    expect(screen.getByText('pkg/widget_test.go')).toBeInTheDocument()
    expect(
      screen.getByText('Covers the primary widget behavior.'),
    ).toBeInTheDocument()
    expect(document.body).toHaveTextContent('func TestWidget')
    expect(screen.getByRole('combobox', { name: 'code language' })).toHaveValue(
      'go',
    )
    expect(screen.getByRole('button', { name: 'Wrap' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'download',
      'pkg/widget_test.go',
    )
    expect(screen.getByText(/1 lines/)).toBeInTheDocument()
  })

  it('lets code artifacts change language and wrapping without raw JSON', () => {
    render(<ArtifactViewer record={record('code', 'const value = 1')} />)

    fireEvent.change(screen.getByRole('combobox', { name: 'code language' }), {
      target: { value: 'javascript' },
    })
    expect(screen.getByRole('combobox', { name: 'code language' })).toHaveValue(
      'javascript',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Wrap' }))
    expect(screen.getByRole('button', { name: 'No wrap' })).toBeInTheDocument()
  })

  it('renders a risk report as dimension bars, findings, and actions', () => {
    render(
      <ArtifactViewer
        record={record(
          'json',
          JSON.stringify({
            risk: 'high',
            score: 68,
            summary: 'The change touches a sensitive persistence path.',
            dimensions: [
              {
                name: 'Behavior',
                score: 72,
                summary: 'State transitions changed.',
              },
            ],
            findings: [
              {
                severity: 'major',
                area: 'wallet',
                message: 'Migration coverage is missing.',
              },
            ],
            actions: ['Add a migration regression test.'],
          }),
        )}
      />,
    )
    expect(screen.getByText('high risk')).toBeInTheDocument()
    expect(screen.getByLabelText('Risk dimensions')).toBeInTheDocument()
    expect(screen.getByText('Behavior')).toBeInTheDocument()
    expect(
      screen.getByText('Migration coverage is missing.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Add a migration regression test.'),
    ).toBeInTheDocument()
  })

  it('renders a multi-line string field as real pre-formatted text, not an escaped one-liner', () => {
    const code = 'package uuid\n\nfunc f() {\n\treturn\n}'
    render(
      <ArtifactViewer
        record={record('json', JSON.stringify({ content: code }))}
      />,
    )
    // JSON.stringify(code) would appear as one line with literal "\n" — a
    // real <pre> with the raw string preserves actual newlines instead.
    const pre = screen.getByText(
      (_, el) => el?.tagName === 'PRE' && el.textContent === code,
    )
    expect(pre).toBeInTheDocument()
    expect(screen.queryByText(/\\n/)).not.toBeInTheDocument()
  })

  it('sanitizes Markdown/Report content through marked + DOMPurify (no script execution)', () => {
    render(
      <ArtifactViewer
        record={record(
          'markdown',
          '# Title\n\n<script>window.__xss = true</script>\n\nbody',
        )}
      />,
    )
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
    expect(() =>
      render(<ArtifactViewer record={record('diff', 'not a real diff')} />),
    ).not.toThrow()
  })

  it("renders a TestResult artifact's pass/fail summary", () => {
    render(
      <ArtifactViewer
        record={record(
          'test-result',
          JSON.stringify({
            passed: false,
            summary: '2 failed',
            output: 'FAIL foo_test.go',
          }),
        )}
      />,
    )
    expect(screen.getByText('fail')).toBeInTheDocument()
    expect(screen.getByText('2 failed')).toBeInTheDocument()
    expect(screen.getByText('FAIL foo_test.go')).toBeInTheDocument()
    expect(screen.getByText('FAIL foo_test.go').closest('pre')).toHaveClass(
      'max-h-[52vh]',
    )
  })

  it('renders a File artifact as a download link', () => {
    render(<ArtifactViewer record={record('file', 'binary-ish content')} />)
    const link = screen.getByRole('link', { name: 'download' })
    expect(link).toHaveAttribute('download', 'abc123')
    expect(link.getAttribute('href')).toMatch(
      /^data:application\/octet-stream;base64,/,
    )
  })

  it('falls back to a raw view for an unrecognized artifact type', () => {
    render(<ArtifactViewer record={record('mystery-type', 'plain content')} />)
    expect(screen.getByText('plain content')).toBeInTheDocument()
  })
})

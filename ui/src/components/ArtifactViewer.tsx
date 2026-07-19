import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useState } from 'react'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import 'react-diff-view/style/index.css'
import type { HighlighterCore } from 'shiki'

import type { NodeRecord } from '../core/audit'
import { contentDataURL, contentText } from '../core/audit'

// ArtifactViewer renders a node's recorded artifact by type (REQ-UI-04): Diff,
// Markdown, JSON, Code, TestResult, Report, Image, and a generic File download
// for everything else (Metrics included — a JSON blob, so it shares JSONView).
// A raw-JSON fallback always exists (dumped via <RawView>), so an artifact type
// the switch doesn't special-case is still legible, never blank chrome.
export function ArtifactViewer({ record }: { record: NodeRecord | undefined }) {
  if (!record || !record.hash) {
    return <p className="text-xs text-neutral-400">no artifact yet</p>
  }

  switch (record.type) {
    case 'diff':
      return <DiffView record={record} />
    case 'markdown':
    case 'report':
      return <MarkdownView record={record} />
    case 'json':
    case 'metrics':
      return <JSONView record={record} />
    case 'code':
      return <CodeView record={record} />
    case 'test-result':
      return <TestResultView record={record} />
    case 'image':
      return <ImageView record={record} />
    case 'file':
      return <FileView record={record} />
    default:
      return <RawView record={record} />
  }
}

function Meta({ record }: { record: NodeRecord }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 font-mono text-[11px] text-neutral-400">
      <span className="uppercase tracking-wide">{record.type ?? 'unknown'}</span>
      <span className="truncate">{record.hash}</span>
    </div>
  )
}

function RawView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? '(binary or undecodable content)'
  return (
    <div>
      <Meta record={record} />
      <pre className="overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">{text}</pre>
    </div>
  )
}

function JSONView({ record }: { record: NodeRecord }) {
  const text = contentText(record)
  const [raw, setRaw] = useState(false)
  let pretty = text
  let parsed: unknown
  try {
    parsed = text != null ? JSON.parse(text) : undefined
    pretty = JSON.stringify(parsed, null, 2)
  } catch {
    // Not valid JSON despite the type tag — fall through to the raw text.
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Meta record={record} />
        <button type="button" className="btn" onClick={() => setRaw((r) => !r)}>
          {raw ? 'tree' : 'raw'}
        </button>
      </div>
      {raw || parsed === undefined ? (
        <pre className="overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">{pretty}</pre>
      ) : (
        <JSONTree value={parsed} />
      )}
    </div>
  )
}

function JSONTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || typeof value !== 'object') {
    return <span className="text-neutral-700">{JSON.stringify(value)}</span>
  }
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value)
  return (
    <ul className="space-y-0.5" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {entries.map(([k, v]) => (
        <li key={k} className="font-mono text-xs">
          <span className="text-neutral-500">{k}: </span>
          {v !== null && typeof v === 'object' ? <JSONTree value={v} depth={depth + 1} /> : <JSONTree value={v} depth={depth + 1} />}
        </li>
      ))}
      {entries.length === 0 && <li className="font-mono text-xs text-neutral-400">{Array.isArray(value) ? '[]' : '{}'}</li>}
    </ul>
  )
}

function MarkdownView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? ''
  const html = DOMPurify.sanitize(marked.parse(text, { async: false }))
  return (
    <div>
      <Meta record={record} />
      {/* Content is model-produced (never hand-authored HTML) and passes
          through marked → DOMPurify before this renders — an LLM output
          coaxed into emitting a script tag must not execute in the user's
          browser (XSS via artifact content). */}
      <div
        className="prose prose-sm max-w-none overflow-auto rounded bg-neutral-50 p-2 text-neutral-800"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

function DiffView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? ''
  const [viewType, setViewType] = useState<'unified' | 'split'>('unified')
  let files: ReturnType<typeof parseDiff>
  try {
    files = parseDiff(text)
  } catch {
    files = []
  }
  if (files.length === 0) {
    return <RawView record={record} />
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Meta record={record} />
        <button type="button" className="btn" onClick={() => setViewType((v) => (v === 'unified' ? 'split' : 'unified'))}>
          {viewType === 'unified' ? 'split' : 'unified'}
        </button>
      </div>
      {files.map((file, i) => (
        <Diff key={i} viewType={viewType} diffType={file.type} hunks={file.hunks} className="text-xs">
          {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
        </Diff>
      ))}
    </div>
  )
}

// codeHighlighter is a lazily-created, module-level singleton (shiki's
// createHighlighterCore is expensive) — every CodeView shares it rather than
// re-loading the WASM grammar engine per artifact. A small, fixed lang set
// keeps this a fine-grained bundle, not shiki's full ~100-language default.
let highlighterPromise: Promise<HighlighterCore> | null = null
const CODE_THEME = 'github-light'

function loadHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = (async () => {
      const { createHighlighterCore } = await import('shiki/core')
      const { createOnigurumaEngine } = await import('shiki/engine/oniguruma')
      const wasm = await import('shiki/wasm')
      return createHighlighterCore({
        themes: [import('@shikijs/themes/github-light')],
        langs: [
          import('@shikijs/langs/go'),
          import('@shikijs/langs/typescript'),
          import('@shikijs/langs/javascript'),
          import('@shikijs/langs/json'),
          import('@shikijs/langs/yaml'),
          import('@shikijs/langs/bash'),
          import('@shikijs/langs/markdown'),
        ],
        engine: createOnigurumaEngine(wasm),
      })
    })()
  }
  return highlighterPromise
}

// No language hint travels on the wire today (domain.Artifact.metadata is
// never actually populated at runtime — core/domain/artifact.go) — 'text'
// (no grammar, still monospaced with the theme's colors) is the honest
// default until a language field exists to key off.
function CodeView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? ''
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    loadHighlighter()
      .then((hl) => {
        if (cancelled) return
        setHtml(hl.codeToHtml(text, { lang: 'text', theme: CODE_THEME }))
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
    return () => {
      cancelled = true
    }
  }, [text])

  return (
    <div>
      <Meta record={record} />
      {html ? (
        <div className="overflow-auto rounded text-xs [&_pre]:p-2" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre className="overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">{text}</pre>
      )}
    </div>
  )
}

function TestResultView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? ''
  let parsed: { passed?: boolean; summary?: string; output?: string } | undefined
  try {
    parsed = JSON.parse(text)
  } catch {
    // Some producers may emit the raw log only — render it below regardless.
  }
  const passed = parsed?.passed
  return (
    <div>
      <Meta record={record} />
      {passed != null && (
        <div className={`mb-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
          {passed ? 'pass' : 'fail'}
        </div>
      )}
      {parsed?.summary && <p className="mb-1.5 text-xs text-neutral-700">{parsed.summary}</p>}
      <pre className="overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">{parsed?.output ?? text}</pre>
    </div>
  )
}

function ImageView({ record }: { record: NodeRecord }) {
  const url = contentDataURL(record, 'image/png')
  return (
    <div>
      <Meta record={record} />
      {url && <img src={url} alt={`artifact ${record.hash}`} className="max-w-full rounded border border-neutral-200" />}
    </div>
  )
}

function FileView({ record }: { record: NodeRecord }) {
  const url = contentDataURL(record)
  return (
    <div>
      <Meta record={record} />
      {url && (
        <a href={url} download={record.hash} className="btn inline-block">
          download
        </a>
      )}
    </div>
  )
}

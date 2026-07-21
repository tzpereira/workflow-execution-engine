import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useEffect, useState } from 'react'
import { Diff, Hunk, parseDiff } from 'react-diff-view'
import 'react-diff-view/style/index.css'
import type { HighlighterCore } from 'shiki'

import type { NodeRecord } from '../core/audit'
import { contentDataURL, contentText } from '../core/audit'
import {
  formatBytes,
  generatedCodeResult,
  httpResult,
  lineCount,
  parsedJSON,
  reviewResult,
  riskReport,
  type GeneratedCodeResult,
  type ReviewResult,
  type RiskReport,
} from '../core/artifactPresentation'

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
      <span className="uppercase tracking-wide">
        {record.type ?? 'unknown'}
      </span>
      <span className="truncate">{record.hash}</span>
    </div>
  )
}

function RawView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? '(binary or undecodable content)'
  return (
    <div>
      <Meta record={record} />
      <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
        {text}
      </pre>
    </div>
  )
}

function JSONView({ record }: { record: NodeRecord }) {
  const text = contentText(record)
  const [raw, setRaw] = useState(false)
  let pretty = text
  const parsed = parsedJSON(record)
  try {
    pretty = JSON.stringify(parsed, null, 2)
  } catch {
    // Not valid JSON despite the type tag — fall through to the raw text.
  }
  const review = reviewResult(parsed)
  if (review) return <ReviewView result={review} />
  const response = httpResult(parsed)
  if (response)
    return <HTTPResponseView status={response.status} body={response.body} />
  const generated = generatedCodeResult(parsed)
  if (generated) return <GeneratedCodeView result={generated} />
  const risk = riskReport(parsed)
  if (risk) return <RiskReportView report={risk} />
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Meta record={record} />
        <button type="button" className="btn" onClick={() => setRaw((r) => !r)}>
          {raw ? 'tree' : 'raw'}
        </button>
      </div>
      {raw || parsed === undefined ? (
        <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
          {pretty}
        </pre>
      ) : (
        <div className="max-h-[52vh] overflow-auto">
          <JSONTree value={parsed} />
        </div>
      )}
    </div>
  )
}

function GeneratedCodeView({ result }: { result: GeneratedCodeResult }) {
  return (
    <div>
      <div className="mb-2 border-b border-neutral-200 pb-2">
        <div className="flex items-center gap-2">
          <span className="rounded bg-neutral-900 px-2 py-1 text-xs font-semibold text-white">
            {result.language}
          </span>
          <span
            className="truncate font-mono text-xs text-neutral-700"
            title={result.path}
          >
            {result.path}
          </span>
        </div>
        <p className="mt-1.5 text-sm text-neutral-700">{result.summary}</p>
      </div>
      <CodeBlock
        text={result.code}
        language={result.language}
        path={result.path}
      />
    </div>
  )
}

function RiskReportView({ report }: { report: RiskReport }) {
  const tone = scoreTone(report.score)
  return (
    <div>
      <div className="flex items-start gap-3 border-b border-neutral-200 pb-3">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded text-lg font-semibold ${tone.badge}`}
        >
          {report.score}
        </div>
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${tone.text}`}>
            {report.risk} risk
          </div>
          <p className="mt-0.5 text-sm text-neutral-700">{report.summary}</p>
        </div>
      </div>

      <div className="mt-3 space-y-2.5" aria-label="Risk dimensions">
        {report.dimensions.map((dimension) => {
          const dimensionTone = scoreTone(dimension.score)
          return (
            <div key={dimension.name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-neutral-800">
                  {dimension.name}
                </span>
                <span className="font-mono text-neutral-500">
                  {dimension.score}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded bg-neutral-100">
                <div
                  className={`h-full ${dimensionTone.bar}`}
                  style={{ width: `${clampScore(dimension.score)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                {dimension.summary}
              </p>
            </div>
          )
        })}
      </div>

      {report.findings.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase text-neutral-500">
            Findings
          </div>
          <ul className="mt-1 divide-y divide-neutral-200">
            {report.findings.map((finding, index) => (
              <li
                key={`${finding.area}-${index}`}
                className="grid grid-cols-[auto_1fr] gap-2 py-2 text-sm"
              >
                <span className="text-xs font-semibold text-neutral-500">
                  {finding.area}
                </span>
                <span className="text-neutral-800">{finding.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.actions.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold uppercase text-neutral-500">
            Actions
          </div>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-neutral-800">
            {report.actions.map((action, index) => (
              <li key={index}>{action}</li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

function scoreTone(score: number): {
  badge: string
  text: string
  bar: string
} {
  if (score >= 75)
    return {
      badge: 'bg-red-100 text-red-800',
      text: 'text-red-700',
      bar: 'bg-red-500',
    }
  if (score >= 50)
    return {
      badge: 'bg-orange-100 text-orange-800',
      text: 'text-orange-700',
      bar: 'bg-orange-500',
    }
  if (score >= 25)
    return {
      badge: 'bg-amber-100 text-amber-800',
      text: 'text-amber-700',
      bar: 'bg-amber-500',
    }
  return {
    badge: 'bg-emerald-100 text-emerald-800',
    text: 'text-emerald-700',
    bar: 'bg-emerald-500',
  }
}

function ReviewView({ result }: { result: ReviewResult }) {
  const verdictTone =
    result.verdict === 'approve'
      ? 'bg-emerald-100 text-emerald-800'
      : result.verdict === 'request-changes'
        ? 'bg-red-100 text-red-800'
        : 'bg-amber-100 text-amber-800'
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-2">
        <span
          className={`rounded px-2 py-1 text-xs font-semibold ${verdictTone}`}
        >
          {result.verdict}
        </span>
        <span className="font-mono text-sm font-semibold text-neutral-900">
          {result.score}/100
        </span>
        <span className="text-xs text-neutral-500">
          {result.issues.length} finding{result.issues.length === 1 ? '' : 's'}
        </span>
      </div>
      {result.issues.length === 0 ? (
        <p className="py-3 text-sm text-neutral-600">No actionable findings.</p>
      ) : (
        <ol className="max-h-[52vh] divide-y divide-neutral-200 overflow-auto">
          {result.issues.map((issue, index) => (
            <li
              key={`${issue.line}-${index}`}
              className="grid grid-cols-[auto_auto_1fr] gap-2 py-2.5 text-sm"
            >
              <span
                className={`mt-0.5 text-[11px] font-semibold uppercase ${issue.severity === 'critical' || issue.severity === 'major' ? 'text-red-700' : issue.severity === 'minor' ? 'text-amber-700' : 'text-neutral-500'}`}
              >
                {issue.severity}
              </span>
              <span className="mt-0.5 font-mono text-xs text-neutral-500">
                L{issue.line}
              </span>
              <span className="min-w-0 break-words text-neutral-800">
                {issue.message}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function HTTPResponseView({ status, body }: { status: number; body: string }) {
  const [showBody, setShowBody] = useState(false)
  const successful = status >= 200 && status < 300
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 pb-2">
        <span
          className={`rounded px-2 py-1 text-xs font-semibold ${successful ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
        >
          HTTP {status}
        </span>
        <span className="text-xs text-neutral-500">{formatBytes(body)}</span>
        <span className="text-xs text-neutral-500">
          {lineCount(body)} lines
        </span>
        <button
          type="button"
          className="btn ml-auto"
          onClick={() => setShowBody((shown) => !shown)}
        >
          {showBody ? 'Hide body' : 'View body'}
        </button>
      </div>
      {showBody && (
        <div className="mt-2">
          {looksLikeDiff(body) ? (
            <DiffContent text={body} />
          ) : (
            <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
              {body}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

function JSONTree({ value, depth = 0 }: { value: unknown; depth?: number }) {
  // A multi-line string (e.g. a Worker's own generated source file, embedded
  // as a plain Contract field) is unreadable JSON.stringify'd — newlines come
  // out as literal "\n" on one long line. Render it as real, pre-formatted
  // text instead; short strings keep the compact quoted form.
  if (typeof value === 'string' && value.includes('\n')) {
    return (
      <pre className="mt-0.5 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-1.5 font-mono text-xs text-neutral-700">
        {value}
      </pre>
    )
  }
  if (value === null || typeof value !== 'object') {
    return <span className="text-neutral-700">{JSON.stringify(value)}</span>
  }
  const entries = Array.isArray(value)
    ? value.map((v, i) => [String(i), v] as const)
    : Object.entries(value)
  return (
    <ul className="space-y-0.5" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {entries.map(([k, v]) => (
        <li key={k} className="font-mono text-xs">
          <span className="text-neutral-500">{k}: </span>
          {v !== null && typeof v === 'object' ? (
            <JSONTree value={v} depth={depth + 1} />
          ) : (
            <JSONTree value={v} depth={depth + 1} />
          )}
        </li>
      ))}
      {entries.length === 0 && (
        <li className="font-mono text-xs text-neutral-400">
          {Array.isArray(value) ? '[]' : '{}'}
        </li>
      )}
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
        className="prose prose-sm max-h-[52vh] max-w-none overflow-auto rounded bg-neutral-50 p-2 text-neutral-800"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

function DiffView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? ''
  return (
    <div>
      <Meta record={record} />
      <DiffContent text={text} />
    </div>
  )
}

function looksLikeDiff(text: string): boolean {
  return text.startsWith('diff --git ') || text.includes('\n@@ ')
}

function DiffContent({ text }: { text: string }) {
  const [viewType, setViewType] = useState<'unified' | 'split'>('unified')
  let files: ReturnType<typeof parseDiff>
  try {
    files = parseDiff(text)
  } catch {
    files = []
  }
  if (files.length === 0) {
    return (
      <pre className="max-h-[52vh] overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
        {text}
      </pre>
    )
  }
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs text-neutral-500">
          {files.length} file{files.length === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          className="btn"
          onClick={() =>
            setViewType((v) => (v === 'unified' ? 'split' : 'unified'))
          }
        >
          {viewType === 'unified' ? 'split' : 'unified'}
        </button>
      </div>
      <div className="max-h-[52vh] overflow-auto">
        {files.map((file, i) => (
          <Diff
            key={i}
            viewType={viewType}
            diffType={file.type}
            hunks={file.hunks}
            className="text-xs"
          >
            {(hunks) =>
              hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
            }
          </Diff>
        ))}
      </div>
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

function CodeView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? ''
  return (
    <div>
      <Meta record={record} />
      <CodeBlock text={text} language={languageFromRecord(record)} />
    </div>
  )
}

function CodeBlock({
  text,
  language,
  path,
}: {
  text: string
  language: string
  path?: string
}) {
  const [wrap, setWrap] = useState(false)
  const [copied, setCopied] = useState(false)
  const [selectedLanguage, setSelectedLanguage] = useState(() =>
    supportedLanguage(language),
  )

  async function copy() {
    try {
      await navigator.clipboard?.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <select
          value={selectedLanguage}
          onChange={(e) => setSelectedLanguage(e.target.value)}
          aria-label="code language"
          className="rounded border border-neutral-300 px-1.5 py-1 font-mono text-[11px] text-neutral-600"
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          onClick={() => setWrap((w) => !w)}
        >
          {wrap ? 'No wrap' : 'Wrap'}
        </button>
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
        <a
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(text)}`}
          download={
            path ?? `artifact.${extensionForLanguage(selectedLanguage)}`
          }
          className="btn inline-block"
        >
          Download
        </a>
        <span className="ml-auto font-mono text-[11px] text-neutral-400">
          {lineCount(text)} lines · {formatBytes(text)}
        </span>
      </div>
      <HighlightedCode text={text} language={selectedLanguage} wrap={wrap} />
    </div>
  )
}

function HighlightedCode({
  text,
  language,
  wrap,
}: {
  text: string
  language: string
  wrap: boolean
}) {
  const [html, setHtml] = useState<string | null>(null)
  const lang = supportedLanguage(language)

  useEffect(() => {
    let cancelled = false
    loadHighlighter()
      .then((hl) => {
        if (cancelled) return
        setHtml(hl.codeToHtml(text, { lang, theme: CODE_THEME }))
      })
      .catch(() => {
        if (!cancelled) setHtml(null)
      })
    return () => {
      cancelled = true
    }
  }, [lang, text])

  return html ? (
    <div
      className={`max-h-[52vh] overflow-auto rounded text-xs [&_pre]:p-3 ${wrap ? '[&_code]:whitespace-pre-wrap [&_code]:break-words [&_pre]:whitespace-pre-wrap' : ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  ) : (
    <pre
      className={`max-h-[52vh] overflow-auto rounded bg-neutral-50 p-3 font-mono text-xs text-neutral-700 ${wrap ? 'whitespace-pre-wrap break-words' : ''}`}
    >
      {text}
    </pre>
  )
}

const SUPPORTED_LANGUAGES = [
  'text',
  'go',
  'typescript',
  'javascript',
  'json',
  'yaml',
  'bash',
  'markdown',
]

function supportedLanguage(language: string): string {
  const normalized = language.toLowerCase()
  const aliases: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    shell: 'bash',
    sh: 'bash',
    md: 'markdown',
    yml: 'yaml',
    golang: 'go',
  }
  const lang = aliases[normalized] ?? normalized
  return SUPPORTED_LANGUAGES.includes(lang) ? lang : 'text'
}

function extensionForLanguage(language: string): string {
  const extensions: Record<string, string> = {
    go: 'go',
    typescript: 'ts',
    javascript: 'js',
    json: 'json',
    yaml: 'yaml',
    bash: 'sh',
    markdown: 'md',
    text: 'txt',
  }
  return extensions[language] ?? 'txt'
}

function languageFromRecord(record: NodeRecord): string {
  const hash = (record.hash ?? '').toLowerCase()
  if (hash.endsWith('.go')) return 'go'
  if (hash.endsWith('.ts') || hash.endsWith('.tsx')) return 'typescript'
  if (hash.endsWith('.js') || hash.endsWith('.jsx')) return 'javascript'
  if (hash.endsWith('.json')) return 'json'
  if (hash.endsWith('.yaml') || hash.endsWith('.yml')) return 'yaml'
  if (hash.endsWith('.sh')) return 'bash'
  if (hash.endsWith('.md')) return 'markdown'
  return 'text'
}

function TestResultView({ record }: { record: NodeRecord }) {
  const text = contentText(record) ?? ''
  let parsed:
    { passed?: boolean; summary?: string; output?: string } | undefined
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
        <div
          className={`mb-1.5 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${passed ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}
        >
          {passed ? 'pass' : 'fail'}
        </div>
      )}
      {parsed?.summary && (
        <p className="mb-1.5 text-xs text-neutral-700">{parsed.summary}</p>
      )}
      <pre className="max-h-[52vh] overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
        {parsed?.output ?? text}
      </pre>
    </div>
  )
}

function ImageView({ record }: { record: NodeRecord }) {
  const url = contentDataURL(record, 'image/png')
  return (
    <div>
      <Meta record={record} />
      {url && (
        <img
          src={url}
          alt={`artifact ${record.hash}`}
          className="max-h-[52vh] max-w-full rounded border border-neutral-200 object-contain"
        />
      )}
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

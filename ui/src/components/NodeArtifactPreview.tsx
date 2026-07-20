import { useState } from 'react'

import type { NodeRecord } from '../core/audit'
import { contentDataURL, contentText } from '../core/audit'
import {
  compactText,
  formatBytes,
  generatedCodeResult,
  httpResult,
  lineCount,
  parsedJSON,
  reviewResult,
  riskReport,
} from '../core/artifactPresentation'
import { ArtifactViewer } from './ArtifactViewer'

// NodeArtifactPreview is the canvas card's own view of what a node produced
// (M1.14b) — a few truncated lines (or an image thumbnail) right on the
// node, so seeing a node's output no longer requires clicking it and
// scrolling the Inspector. The expand button opens the exact same
// ArtifactViewer the Inspector uses, full-size, in a modal — one rendering
// path, shown two ways, never a second implementation to keep in sync.
export function NodeArtifactPreview({
  record,
}: {
  record: NodeRecord | undefined
}) {
  const [expanded, setExpanded] = useState(false)
  if (!record?.hash) return null

  return (
    <div
      className="nodrag mt-1.5 border-t border-neutral-100 pt-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wide text-neutral-400">
          {record.type ?? 'output'}
        </span>
        <button
          type="button"
          className="nodrag -m-1 p-1 text-sm leading-none text-neutral-400 hover:text-neutral-700"
          title="Expand this node's full output"
          aria-label="Expand output"
          onClick={() => setExpanded(true)}
        >
          ⤢
        </button>
      </div>
      <Snippet record={record} />
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24"
          onClick={() => setExpanded(false)}
        >
          <div
            className="max-h-[70vh] w-[42rem] max-w-[90vw] overflow-auto rounded-lg border border-neutral-200 bg-white p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-neutral-900">
                Artifact
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => setExpanded(false)}
              >
                close
              </button>
            </div>
            <ArtifactViewer record={record} />
          </div>
        </div>
      )}
    </div>
  )
}

function Snippet({ record }: { record: NodeRecord }) {
  if (record.type === 'image') {
    const src = contentDataURL(record, 'image/png')
    return src ? (
      <img
        src={src}
        alt="artifact preview"
        className="mt-1 max-h-16 rounded object-contain"
      />
    ) : null
  }

  const text = contentText(record)
  if (!text)
    return (
      <p className="mt-1 text-[10px] text-neutral-400">
        (binary or undecodable content)
      </p>
    )

  const parsed = parsedJSON(record)
  const review = reviewResult(parsed)
  if (review) {
    return (
      <div className="mt-1 h-14 overflow-hidden text-[10px] text-neutral-600">
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold ${review.verdict === 'request-changes' ? 'text-red-700' : review.verdict === 'approve' ? 'text-emerald-700' : 'text-amber-700'}`}
          >
            {review.verdict}
          </span>
          <span>{review.score}/100</span>
          <span>
            {review.issues.length} finding
            {review.issues.length === 1 ? '' : 's'}
          </span>
        </div>
        {review.issues[0] && (
          <p className="mt-1 leading-tight text-neutral-700">
            {compactText(review.issues[0].message, 120)}
          </p>
        )}
      </div>
    )
  }

  const response = httpResult(parsed)
  if (response) {
    return (
      <div className="mt-1 flex h-10 items-start gap-2 text-[10px] text-neutral-600">
        <span
          className={
            response.status >= 200 && response.status < 300
              ? 'font-semibold text-emerald-700'
              : 'font-semibold text-red-700'
          }
        >
          HTTP {response.status}
        </span>
        <span>{formatBytes(response.body)}</span>
        <span>{lineCount(response.body)} lines</span>
      </div>
    )
  }

  const generated = generatedCodeResult(parsed)
  if (generated) {
    return (
      <div className="mt-1 h-14 overflow-hidden text-[10px] text-neutral-600">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-800">
            {generated.language}
          </span>
          <span className="truncate font-mono">{generated.path}</span>
        </div>
        <p className="mt-1 leading-tight text-neutral-700">
          {compactText(generated.summary, 120)}
        </p>
      </div>
    )
  }

  const risk = riskReport(parsed)
  if (risk) {
    return (
      <div className="mt-1 h-14 overflow-hidden text-[10px] text-neutral-600">
        <div className="flex items-center gap-2">
          <span
            className={`font-semibold ${risk.score >= 75 ? 'text-red-700' : risk.score >= 50 ? 'text-orange-700' : risk.score >= 25 ? 'text-amber-700' : 'text-emerald-700'}`}
          >
            {risk.risk} risk
          </span>
          <span>{risk.score}/100</span>
          <span>{risk.findings.length} findings</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded bg-neutral-100">
          <div
            className="h-full bg-neutral-700"
            style={{ width: `${Math.max(0, Math.min(100, risk.score))}%` }}
          />
        </div>
      </div>
    )
  }

  return (
    <pre className="mt-1 h-14 overflow-hidden whitespace-pre-wrap break-words font-mono text-[10px] leading-tight text-neutral-600">
      {compactText(text, 220)}
    </pre>
  )
}

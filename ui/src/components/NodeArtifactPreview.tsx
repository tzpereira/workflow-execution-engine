import { useState } from 'react'

import type { NodeRecord } from '../core/audit'
import { contentDataURL, contentText } from '../core/audit'
import { ArtifactViewer } from './ArtifactViewer'

// NodeArtifactPreview is the canvas card's own view of what a node produced
// (M1.14b) — a few truncated lines (or an image thumbnail) right on the
// node, so seeing a node's output no longer requires clicking it and
// scrolling the Inspector. The expand button opens the exact same
// ArtifactViewer the Inspector uses, full-size, in a modal — one rendering
// path, shown two ways, never a second implementation to keep in sync.
export function NodeArtifactPreview({ record }: { record: NodeRecord | undefined }) {
  const [expanded, setExpanded] = useState(false)
  if (!record?.hash) return null

  return (
    <div className="nodrag mt-1.5 border-t border-neutral-100 pt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-wide text-neutral-400">{record.type ?? 'output'}</span>
        <button
          type="button"
          className="nodrag -m-1 p-1 text-[9px] text-neutral-400 hover:text-neutral-700"
          title="Expand this node's full output"
          onClick={() => setExpanded(true)}
        >
          expand ⤢
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
              <span className="text-sm font-semibold text-neutral-900">Artifact</span>
              <button type="button" className="btn" onClick={() => setExpanded(false)}>
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

const PREVIEW_LINES = 3

function Snippet({ record }: { record: NodeRecord }) {
  if (record.type === 'image') {
    const src = contentDataURL(record, 'image/png')
    return src ? <img src={src} alt="artifact preview" className="mt-1 max-h-16 rounded object-contain" /> : null
  }

  const text = contentText(record)
  if (!text) return <p className="mt-1 text-[10px] text-neutral-400">(binary or undecodable content)</p>

  const lines = text.split('\n').slice(0, PREVIEW_LINES)
  const truncated = text.split('\n').length > PREVIEW_LINES
  return (
    <pre className="mt-1 overflow-hidden whitespace-pre-wrap break-words font-mono text-[10px] leading-tight text-neutral-600">
      {lines.join('\n')}
      {truncated && '\n…'}
    </pre>
  )
}

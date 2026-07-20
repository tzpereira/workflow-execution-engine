import { useState } from 'react'

import type { InputDecl } from '../core/model'

// RunInputsModal collects values for a Workflow's declared Inputs (REQ-INPUT-01)
// before a run starts — the interface-side half of "pick which repo/PR to run
// against" without a workflow-level "inputs" concept existing before this
// milestone. Same overlay shell as TemplateGallery/CommandPalette: a transient
// picker, not a panel someone lives in. Toolbar only renders this when the
// loaded workflow has at least one declared input; a workflow with none skips
// straight to Run, unchanged.
export function RunInputsModal({
  inputs,
  onCancel,
  onSubmit,
}: {
  inputs: InputDecl[]
  onCancel: () => void
  onSubmit: (values: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(inputs.map((d) => [d.name, d.default ?? '']))
  )

  const missing = inputs.filter((d) => d.required && !values[d.name]?.trim())
  const canRun = missing.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onClick={onCancel}>
      <div
        className="w-[28rem] max-w-[90vw] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2.5">
          <span className="text-sm font-semibold text-neutral-900">Run inputs</span>
          <button type="button" className="btn" onClick={onCancel}>
            cancel
          </button>
        </div>
        <div className="max-h-96 space-y-3 overflow-auto p-3">
          {inputs.map((d) => (
            <label key={d.name} className="block">
              <div className="mb-1 flex items-baseline gap-1.5">
                <span className="font-mono text-xs font-medium text-neutral-900">{d.name}</span>
                {d.required && <span className="text-xs text-red-600">required</span>}
              </div>
              {d.description && <p className="mb-1 text-xs text-neutral-500">{d.description}</p>}
              <input
                type="text"
                aria-label={d.name}
                value={values[d.name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [d.name]: e.target.value }))}
                placeholder={d.default}
                className="w-full rounded border border-neutral-300 px-2 py-1 font-mono text-xs text-neutral-800"
              />
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-3 py-2.5">
          <button
            type="button"
            className="btn"
            disabled={!canRun}
            title={canRun ? undefined : `Missing required: ${missing.map((d) => d.name).join(', ')}`}
            onClick={() => onSubmit(values)}
          >
            Run
          </button>
        </div>
      </div>
    </div>
  )
}

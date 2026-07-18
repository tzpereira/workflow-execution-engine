import { useWorkspace } from '../store'
import { nodeKind } from '../core/model'
import { budget as budgetSchema } from '../schemas'
import { SchemaForm } from './SchemaForm'

// Inspector is the right pane: the selected node's details, or the workflow's
// own metadata when nothing is selected. Schema-driven editing forms (from the
// engine's JSON Schemas) land in the next step; this shows the current values.
export function Inspector() {
  const selectedId = useWorkspace((s) => s.selectedNodeId)
  const nodes = useWorkspace((s) => s.nodes)
  const meta = useWorkspace((s) => s.meta)
  const setMeta = useWorkspace((s) => s.setMeta)

  const selected = nodes.find((n) => n.id === selectedId)?.data.node

  return (
    <aside className="flex h-full w-80 flex-col border-l border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
        {selected ? 'Node' : 'Workflow'}
      </div>
      <div className="flex-1 overflow-auto p-3 text-sm">
        {selected ? (
          <dl className="space-y-2">
            <Field label="id" value={selected.id} />
            <Field label="kind" value={nodeKind(selected)} />
            <Field
              label={nodeKind(selected) === 'tool' ? 'tool' : 'worker'}
              value={nodeKind(selected) === 'tool' ? (selected.tool?.toolName ?? '—') : (selected.worker ?? '—')}
            />
            <div>
              <dt className="text-xs text-neutral-500">body</dt>
              <dd>
                <pre className="mt-1 overflow-auto rounded bg-neutral-50 p-2 font-mono text-xs text-neutral-700">
                  {JSON.stringify(selected, null, 2)}
                </pre>
              </dd>
            </div>
          </dl>
        ) : (
          <div className="space-y-3">
            <dl className="space-y-2">
              <Field label="id" value={meta.id} />
              <Field label="version" value={meta.version} />
            </dl>
            <div>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Budget
              </div>
              {/* Generated from schemas/budget.schema.json — the exact file the
                  engine validates against, never hand-copied fields. */}
              <SchemaForm
                schema={budgetSchema}
                formData={meta.budget}
                onChange={(b) => setMeta({ ...meta, budget: b })}
              />
            </div>
          </div>
        )}
      </div>
    </aside>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-neutral-500">{label}</dt>
      <dd className="font-mono text-neutral-900">{value}</dd>
    </div>
  )
}

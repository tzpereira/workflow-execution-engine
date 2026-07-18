import { Command } from 'cmdk'

import { validateWorkflow } from '../core/validate'
import { downloadText } from '../download'
import { useWorkspace } from '../store'

// CommandPalette is the ⌘K surface: keyboard-first access to the workflow
// actions (export, validate, add nodes). It reads and drives the same store the
// panels do — a command is just another way to invoke a store action.
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const meta = useWorkspace((s) => s.meta)
  const exportText = useWorkspace((s) => s.exportText)
  const workflow = useWorkspace((s) => s.workflow)
  const addNode = useWorkspace((s) => s.addNode)
  const nodes = useWorkspace((s) => s.nodes)
  const selectNode = useWorkspace((s) => s.selectNode)

  const close = () => onOpenChange(false)

  function run(fn: () => void) {
    fn()
    close()
  }

  function exportAs(format: 'yaml' | 'json') {
    downloadText(exportText(format), `${meta.id}.${format === 'json' ? 'json' : 'yaml'}`)
  }

  function validate() {
    const problems = validateWorkflow(workflow())
    useWorkspace.setState({
      error: problems.length === 0 ? null : `${problems.length} problem(s): ${problems[0]}`,
    })
  }

  function addFreshNode(kind: 'worker' | 'tool') {
    const id = uniqueId(kind, new Set(nodes.map((n) => n.id)))
    addNode(kind === 'worker' ? { id, worker: 'worker@1.0.0' } : { id, tool: { toolName: 'terminal', input: {} } })
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-32"
    >
      <div className="w-[32rem] overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl">
        <Command.Input
          placeholder="Type a command…"
          className="w-full border-b border-neutral-200 px-3 py-2.5 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-auto p-1">
          <Command.Empty className="px-3 py-4 text-sm text-neutral-400">No matching command.</Command.Empty>

          <Command.Group heading="Workflow" className="px-1 py-1 text-xs text-neutral-400">
            <Item onSelect={() => run(() => exportAs('yaml'))}>Export as YAML</Item>
            <Item onSelect={() => run(() => exportAs('json'))}>Export as JSON</Item>
            <Item onSelect={() => run(validate)}>Validate workflow</Item>
          </Command.Group>

          <Command.Group heading="Add node" className="px-1 py-1 text-xs text-neutral-400">
            <Item onSelect={() => run(() => addFreshNode('worker'))}>Add worker node</Item>
            <Item onSelect={() => run(() => addFreshNode('tool'))}>Add tool node</Item>
          </Command.Group>

          {nodes.length > 0 && (
            <Command.Group heading="Select node" className="px-1 py-1 text-xs text-neutral-400">
              {nodes.map((n) => (
                <Item key={n.id} onSelect={() => run(() => selectNode(n.id))}>
                  {n.id}
                </Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}

function Item({ children, onSelect }: { children: React.ReactNode; onSelect: () => void }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="cursor-pointer rounded px-2 py-1.5 text-sm text-neutral-800 data-[selected=true]:bg-neutral-100"
    >
      {children}
    </Command.Item>
  )
}

// uniqueId returns "<kind>-N" not already taken.
function uniqueId(kind: string, taken: Set<string>): string {
  let i = 1
  while (taken.has(`${kind}-${i}`)) i++
  return `${kind}-${i}`
}

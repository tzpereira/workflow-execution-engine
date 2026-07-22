import { Command } from 'cmdk'

import { validateWorkflow } from '../core/validate'
import { downloadText } from '../download'
import { useLive } from '../liveStore'
import { useWorkspace } from '../store'

// CommandPalette is the ⌘K surface: keyboard-first access to the workflow
// actions (export, validate, add nodes). It reads and drives the same store the
// panels do — a command is just another way to invoke a store action.
export function CommandPalette({
  open,
  onOpenChange,
  onOpenTemplates,
  onOpenSettings,
  onOpenHelp,
  onToggleTheme,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onOpenTemplates: () => void
  onOpenSettings: () => void
  onOpenHelp: () => void
  onToggleTheme: () => void
}) {
  const meta = useWorkspace((s) => s.meta)
  const fileName = useWorkspace((s) => s.fileName)
  const exportText = useWorkspace((s) => s.exportText)
  const workflow = useWorkspace((s) => s.workflow)
  const addNode = useWorkspace((s) => s.addNode)
  const nodes = useWorkspace((s) => s.nodes)
  const selectNode = useWorkspace((s) => s.selectNode)
  const newDocument = useWorkspace((s) => s.newDocument)
  const relayout = useWorkspace((s) => s.relayout)
  const runExecution = useLive((s) => s.run)
  const cancel = useLive((s) => s.cancel)
  const liveState = useLive((s) => s.live.state)

  const close = () => onOpenChange(false)

  function run(fn: () => void) {
    fn()
    close()
  }

  function exportAs(format: 'yaml' | 'json') {
    downloadText(
      exportText(format),
      `${meta.id}.${format === 'json' ? 'json' : 'yaml'}`,
    )
  }

  function validate() {
    const problems = validateWorkflow(workflow())
    useWorkspace.setState({
      error:
        problems.length === 0
          ? null
          : `${problems.length} problem(s): ${problems[0]}`,
    })
  }

  function addFreshNode(kind: 'worker' | 'tool') {
    const id = uniqueId(kind, new Set(nodes.map((n) => n.id)))
    addNode(
      kind === 'worker'
        ? { id, worker: `${id}@1.0.0` }
        : { id, tool: { toolName: 'terminal', input: {} } },
    )
  }

  function runWorkflow() {
    if (!fileName) {
      useWorkspace.setState({
        error: 'Import or create a workflow before running.',
      })
      return
    }
    if ((meta.inputs?.length ?? 0) > 0) {
      useWorkspace.setState({
        error: 'This workflow needs inputs; use the toolbar Run button.',
      })
      return
    }
    void runExecution(
      fileName,
      nodes.map((n) => n.id),
    )
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command palette"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-32"
    >
      <div className="token-card w-[36rem] overflow-hidden">
        <Command.Input
          placeholder="Type a command…"
          className="w-full border-b border-neutral-200 px-3 py-2.5 text-sm outline-none"
        />
        <Command.List className="max-h-80 overflow-auto p-1">
          <Command.Empty className="px-3 py-4 text-sm text-neutral-400">
            No matching command.
          </Command.Empty>

          <Command.Group
            heading="Workflow"
            className="px-1 py-1 text-xs text-neutral-400"
          >
            <Item icon="▶" hint="run" onSelect={() => run(runWorkflow)}>
              Run workflow
            </Item>
            {liveState === 'running' && (
              <Item
                icon="■"
                hint="cancel"
                onSelect={() => run(() => void cancel())}
              >
                Cancel run
              </Item>
            )}
            <Item icon="✓" hint="check" onSelect={() => run(validate)}>
              Validate workflow
            </Item>
            <Item
              icon="⇩"
              hint="YAML"
              onSelect={() => run(() => exportAs('yaml'))}
            >
              Export as YAML
            </Item>
            <Item
              icon="⇩"
              hint="JSON"
              onSelect={() => run(() => exportAs('json'))}
            >
              Export as JSON
            </Item>
            <Item icon="▦" hint="layout" onSelect={() => run(relayout)}>
              Re-layout canvas
            </Item>
          </Command.Group>

          <Command.Group
            heading="Workspace"
            className="px-1 py-1 text-xs text-neutral-400"
          >
            <Item icon="+" hint="doc" onSelect={() => run(newDocument)}>
              New workflow document
            </Item>
            <Item
              icon="◫"
              hint="templates"
              onSelect={() => run(onOpenTemplates)}
            >
              Open templates
            </Item>
            <Item
              icon="⚙"
              hint="connections"
              onSelect={() => run(onOpenSettings)}
            >
              Open settings
            </Item>
            <Item icon="◐" hint="theme" onSelect={() => run(onToggleTheme)}>
              Toggle theme
            </Item>
            <Item icon="?" hint="docs" onSelect={() => run(onOpenHelp)}>
              Open help
            </Item>
          </Command.Group>

          <Command.Group
            heading="Add node"
            className="px-1 py-1 text-xs text-neutral-400"
          >
            <Item
              icon="W"
              hint="node"
              onSelect={() => run(() => addFreshNode('worker'))}
            >
              Add worker node
            </Item>
            <Item
              icon="T"
              hint="node"
              onSelect={() => run(() => addFreshNode('tool'))}
            >
              Add tool node
            </Item>
          </Command.Group>

          {nodes.length > 0 && (
            <Command.Group
              heading="Select node"
              className="px-1 py-1 text-xs text-neutral-400"
            >
              {nodes.map((n) => (
                <Item
                  key={n.id}
                  icon="→"
                  hint="jump"
                  onSelect={() => run(() => selectNode(n.id))}
                >
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

function Item({
  children,
  onSelect,
  icon,
  hint,
}: {
  children: React.ReactNode
  onSelect: () => void
  icon?: string
  hint?: string
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="command-item flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-neutral-800 data-[selected=true]:bg-neutral-100"
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-[10px]"
        aria-hidden="true"
      >
        {icon ?? '•'}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && (
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
          {hint}
        </span>
      )}
    </Command.Item>
  )
}

// uniqueId returns "<kind>-N" not already taken.
function uniqueId(kind: string, taken: Set<string>): string {
  let i = 1
  while (taken.has(`${kind}-${i}`)) i++
  return `${kind}-${i}`
}

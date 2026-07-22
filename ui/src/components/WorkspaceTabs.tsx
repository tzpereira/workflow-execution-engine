import { useLive } from '../liveStore'
import { useWorkspace } from '../store'

export function WorkspaceTabs() {
  const documents = useWorkspace((s) => s.documents)
  const activeDocumentId = useWorkspace((s) => s.activeDocumentId)
  const switchDocument = useWorkspace((s) => s.switchDocument)
  const closeDocument = useWorkspace((s) => s.closeDocument)
  const newDocument = useWorkspace((s) => s.newDocument)
  const liveState = useLive((s) => s.live.state)
  const running = liveState === 'running'

  function requestClose(id: string) {
    const doc = documents.find((d) => d.id === id)
    if (!doc) return
    if ((doc.dirty || running) && !window.confirm('Close this workflow document? Unsaved edits or a running execution may be lost from view.')) {
      return
    }
    closeDocument(id)
  }

  return (
    <div className="flex h-9 min-w-0 items-end gap-1 border-b border-neutral-200 bg-neutral-100 px-2 pt-1 md:px-3">
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto">
        {documents.map((doc) => {
          const active = doc.id === activeDocumentId
          return (
            <div
              key={doc.id}
              className={`flex h-8 max-w-56 shrink-0 items-center gap-1.5 border px-2 text-xs ${
                active
                  ? 'border-neutral-200 border-b-white bg-white text-neutral-900'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-600'
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 items-center gap-1.5"
                onClick={() => switchDocument(doc.id)}
                title={doc.label}
              >
                <span aria-hidden="true">{doc.dirty ? '●' : '□'}</span>
                <span className="truncate">{doc.label}</span>
              </button>
              <button
                type="button"
                className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-200 hover:text-neutral-700"
                onClick={() => requestClose(doc.id)}
                title="Close document"
                aria-label={`Close ${doc.label}`}
                disabled={documents.length <= 1}
              >
                ×
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="flex h-8 w-8 shrink-0 items-center justify-center border border-neutral-200 bg-neutral-50 text-sm text-neutral-600 hover:bg-white"
          onClick={newDocument}
          title="New workflow document"
          aria-label="New workflow document"
        >
          +
        </button>
      </div>
    </div>
  )
}

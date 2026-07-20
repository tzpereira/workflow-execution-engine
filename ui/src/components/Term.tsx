import { useState } from 'react'

// Term wraps a domain-jargon label (Contract, Context Policy, Artifact, Node
// Cache) with a one-sentence, first-encounter explanation (M1.14d) — shown
// once per term per browser (localStorage), never re-shown after dismissal,
// never a modal that blocks interaction with anything else. A tooltip, not a
// tour: the user can keep working with it open or closed.
//
// Scope note: the milestone's task text also asked for a link to each term's
// docs/concepts/*.md page. This tool has no docs-serving mechanism (the repo's
// markdown isn't hosted anywhere the running UI can link to), so this ships
// with just the explanation text — disclosed in EXECUTION.md rather than
// linking somewhere that would 404.
const EXPLANATIONS: Record<string, string> = {
  Contract: "The enforced spec a Worker's output must satisfy — schema-validated before it becomes an Artifact, never a suggestion.",
  'Context policy': "What a Worker is allowed to see — never more than its direct parents' output, narrowed further by mode.",
  Artifact: "A node's immutable, content-addressed output — what flows along edges and what the cache keys on.",
  'Node Cache': 'Reuses a node\'s prior output when nothing it depends on changed — a re-run only redoes what actually needs it.',
}

export function Term({ name, children }: { name: keyof typeof EXPLANATIONS; children: React.ReactNode }) {
  const storageKey = `wee.termSeen.${name}`
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(storageKey) === '1'
    } catch {
      return false
    }
  })

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(storageKey, '1')
    } catch {
      // localStorage unavailable (private browsing, etc.) — just don't persist.
    }
  }

  if (dismissed) return <>{children}</>

  return (
    <span className="block">
      {children}
      <span
        role="tooltip"
        className="mt-1 flex items-start gap-1.5 rounded bg-neutral-900 px-2 py-1 text-[11px] font-normal normal-case leading-snug tracking-normal text-white"
      >
        <span className="flex-1">{EXPLANATIONS[name]}</span>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-neutral-400 hover:text-white"
          aria-label={`Dismiss ${name} explanation`}
        >
          ✕
        </button>
      </span>
    </span>
  )
}

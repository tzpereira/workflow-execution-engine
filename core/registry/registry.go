package registry

import (
	"fmt"

	"github.com/tzpereira/workflow-execution-engine/core/canonical"
	"github.com/tzpereira/workflow-execution-engine/core/domain"
)

// Kind names the sort of definition a reference points at, for error messages
// and export paths.
type Kind string

const (
	KindWorkflow Kind = "workflow"
	KindWorker   Kind = "worker"
)

// workerEntry / workflowEntry pair a registered definition with the canonical
// content hash computed when it was registered — the value immutability checks
// compare against (REQ-VERSION-01) and export/pinning read (REQ-VERSION-02/03).
type workerEntry struct {
	def  domain.Worker
	hash string
}

type workflowEntry struct {
	def  domain.Workflow
	hash string
}

// Registry is the in-memory versioned definition store. It is not safe for
// concurrent registration; register definitions up front (e.g. at CLI startup)
// and then read. Lookup makes it an engine.WorkerSource, so it substitutes for
// the in-memory map an executor was wired with, unchanged.
type Registry struct {
	workflows map[string]workflowEntry
	workers   map[string]workerEntry
}

// New returns an empty Registry.
func New() *Registry {
	return &Registry{
		workflows: make(map[string]workflowEntry),
		workers:   make(map[string]workerEntry),
	}
}

// RegisterWorker validates the Worker's semver and stores it at "id@version".
// Re-registering identical content at the same version is a no-op; registering
// *different* content at an already-taken version is a *ConflictError
// (REQ-VERSION-01).
func (r *Registry) RegisterWorker(w domain.Worker) error {
	if w.ID == "" {
		return fmt.Errorf("registry: worker has no id")
	}
	if !ValidVersion(w.Version) {
		return fmt.Errorf("registry: worker %q has an invalid semver version %q", w.ID, w.Version)
	}
	ref := w.ID + "@" + w.Version
	hash, err := canonical.Hash(w)
	if err != nil {
		return fmt.Errorf("registry: hash worker %q: %w", ref, err)
	}
	if existing, ok := r.workers[ref]; ok && existing.hash != hash {
		return &ConflictError{Kind: KindWorker, Ref: ref, Existing: existing.hash, Incoming: hash}
	}
	r.workers[ref] = workerEntry{def: w, hash: hash}
	return nil
}

// RegisterWorkflow validates the Workflow's semver and stores it at
// "id@version", with the same immutability guarantee as RegisterWorker.
func (r *Registry) RegisterWorkflow(wf domain.Workflow) error {
	if wf.ID == "" {
		return fmt.Errorf("registry: workflow has no id")
	}
	if !ValidVersion(wf.Version) {
		return fmt.Errorf("registry: workflow %q has an invalid semver version %q", wf.ID, wf.Version)
	}
	ref := wf.ID + "@" + wf.Version
	hash, err := canonical.Hash(wf)
	if err != nil {
		return fmt.Errorf("registry: hash workflow %q: %w", ref, err)
	}
	if existing, ok := r.workflows[ref]; ok && existing.hash != hash {
		return &ConflictError{Kind: KindWorkflow, Ref: ref, Existing: existing.hash, Incoming: hash}
	}
	r.workflows[ref] = workflowEntry{def: wf, hash: hash}
	return nil
}

// Lookup resolves a worker "id@version" reference, implementing
// engine.WorkerSource so the Registry drops in wherever the in-memory map did.
func (r *Registry) Lookup(ref string) (domain.Worker, bool) {
	e, ok := r.workers[ref]
	return e.def, ok
}

// ContentHash returns the canonical content hash recorded for a registered
// worker or workflow reference, or ok=false if nothing is registered there.
func (r *Registry) ContentHash(ref string) (hash string, ok bool) {
	if e, ok := r.workers[ref]; ok {
		return e.hash, true
	}
	if e, ok := r.workflows[ref]; ok {
		return e.hash, true
	}
	return "", false
}

// DefinitionHashes returns the content hash of every worker wf references that
// is registered here — the map an execution records in its snapshot so replay
// resolves definitions from the pinned record, never the current registry state
// (REQ-VERSION-02). Tool-backed nodes (no worker) and unregistered references
// are omitted rather than erroring: this is provenance capture, not validation.
func (r *Registry) DefinitionHashes(wf domain.Workflow) map[string]string {
	out := make(map[string]string)
	for _, n := range wf.Nodes {
		if n.Worker == "" {
			continue
		}
		if e, ok := r.workers[n.Worker]; ok {
			out[n.Worker] = e.hash
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

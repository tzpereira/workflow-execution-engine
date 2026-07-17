package engine

import (
	"context"
	"errors"
	"fmt"

	"github.com/tzpereira/workflow-execution-engine/core/cache"
	"github.com/tzpereira/workflow-execution-engine/core/canonical"
	"github.com/tzpereira/workflow-execution-engine/core/contract"
	"github.com/tzpereira/workflow-execution-engine/core/cost"
	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/model"
	"github.com/tzpereira/workflow-execution-engine/core/policy"
)

// WorkerSource resolves a node's "worker" reference (id@version) to its Worker
// definition. Until the registry lands (M1.8) this is any in-memory map; the
// registry will satisfy the same interface without the executor changing.
type WorkerSource interface {
	Lookup(ref string) (domain.Worker, bool)
}

// MapWorkerSource is a WorkerSource backed by a map keyed by "id@version".
type MapWorkerSource map[string]domain.Worker

// Lookup implements WorkerSource.
func (m MapWorkerSource) Lookup(ref string) (domain.Worker, bool) { w, ok := m[ref]; return w, ok }

// WorkerExecutor is the model-backed NodeExecutor (REQ-WORKER-02): it resolves
// the Worker, narrows context to what the policy admits (REQ-CTXPOL-01),
// compiles the one model call (REQ-CONTRACT-01 plumbing), invokes the selected
// provider (REQ-MODEL-01), enforces the output contract (REQ-CONTRACT-01..03),
// and prices the call (REQ-BUDGET-03). It holds no per-node or cross-attempt
// state — retry feedback arrives through NodeRequest, and the engine owns the
// retry loop.
type WorkerExecutor struct {
	workers   WorkerSource
	providers *model.Registry
}

// NewWorkerExecutor builds a WorkerExecutor over a worker source and a provider
// registry.
func NewWorkerExecutor(workers WorkerSource, providers *model.Registry) *WorkerExecutor {
	return &WorkerExecutor{workers: workers, providers: providers}
}

// Execute implements NodeExecutor.
func (e *WorkerExecutor) Execute(ctx context.Context, req NodeRequest) (NodeResult, error) {
	w, ok := e.workers.Lookup(req.Node.Worker)
	if !ok {
		return NodeResult{}, Fatal(fmt.Errorf("engine: no worker %q for node %q", req.Node.Worker, req.Node.ID))
	}

	// Resolve exactly what this Worker may see. A node-level policy overrides the
	// Worker's; absent both, Resolve defaults to parent-only (REQ-CTXPOL-02).
	pol := w.ContextPolicy
	if req.Node.ContextPolicy != nil {
		pol = *req.Node.ContextPolicy
	}
	admitted, err := policy.Resolve(pol, toPolicyItems(req.Inputs))
	if err != nil {
		return NodeResult{}, Fatal(fmt.Errorf("engine: node %q: %w", req.Node.ID, err))
	}

	messages := contract.Compile(w, admitted, req.RetryFeedback)

	prov, err := e.providers.Get(w.Model.Provider)
	if err != nil {
		return NodeResult{}, Fatal(fmt.Errorf("engine: node %q: %w", req.Node.ID, err))
	}

	resp, err := prov.Complete(ctx, messages, model.Params{Model: w.Model.Model, Extra: w.Model.Params})
	if err != nil {
		return NodeResult{}, mapProviderError(err)
	}

	output := []byte(resp.Content)
	if verr := contract.Enforce(w.Contract, output); verr != nil {
		var ve *contract.ViolationError
		if errors.As(verr, &ve) {
			// Retryable with delta feedback, bounded by contract.maxRetries.
			return NodeResult{}, ContractViolation(ve, ve.Feedback, w.Contract.MaxRetries)
		}
		// A malformed outputSchema is a configuration fault, not a violation.
		return NodeResult{}, Fatal(fmt.Errorf("engine: node %q: %w", req.Node.ID, verr))
	}

	providerName := w.Model.Provider
	if providerName == "" {
		providerName = model.DefaultProvider
	}
	return NodeResult{
		Content:       output,
		Type:          domain.ArtifactJSON,
		MimeType:      "application/json",
		CostUSD:       cost.Compute(providerName, w.Model.Model, resp.InputTokens, resp.OutputTokens),
		Tokens:        resp.InputTokens + resp.OutputTokens,
		Validated:     true,
		ContextHashes: policy.Hashes(admitted),
	}, nil
}

// CacheKey derives the node's cache key from its Worker definition and resolved
// inputs (REQ-CACHE-01), opting model-backed nodes into the cache. It returns
// ok=false when the Worker can't be resolved (the node then always executes).
//
// Tool "versions" are the Worker's declared tool names for now: tools are not
// yet invoked by the executor (that wiring lands with the flagship template,
// M1.14), so the names are the version proxy — changing the allowlist still
// invalidates the key.
func (e *WorkerExecutor) CacheKey(node domain.Node, inputs []NodeInput) (string, bool) {
	w, ok := e.workers.Lookup(node.Worker)
	if !ok {
		return "", false
	}
	contractHash, err := canonical.Hash(w.Contract)
	if err != nil {
		return "", false
	}
	hashes := make([]string, 0, len(inputs))
	for _, in := range inputs {
		hashes = append(hashes, in.Hash)
	}
	pol := w.ContextPolicy
	if node.ContextPolicy != nil {
		pol = *node.ContextPolicy
	}
	return cache.Key(cache.Inputs{
		WorkerID:            w.ID,
		WorkerVersion:       w.Version,
		ContractHash:        contractHash,
		InputArtifactHashes: hashes,
		Model:               w.Model,
		ToolVersions:        w.Tools,
		ContextPolicy:       pol,
	}), true
}

// mapProviderError translates a provider's transient/fatal classification into
// the engine's retry classes (REQ-MODEL-05). Anything unrecognized is fatal.
func mapProviderError(err error) error {
	var te *model.TransientError
	if errors.As(err, &te) {
		return Transient(err)
	}
	var fe *model.FatalError
	if errors.As(err, &fe) {
		return Fatal(err)
	}
	return Fatal(err)
}

func toPolicyItems(inputs []NodeInput) []policy.Item {
	items := make([]policy.Item, len(inputs))
	for i, in := range inputs {
		items[i] = policy.Item{FromNode: in.FromNode, Type: in.Type, Hash: in.Hash, Content: in.Content}
	}
	return items
}

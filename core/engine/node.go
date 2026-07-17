package engine

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/tzpereira/workflow-execution-engine/core/cache"
	"github.com/tzpereira/workflow-execution-engine/core/domain"
)

// NodeInput is one upstream artifact made available to a node, carried by an
// active incoming edge. Type and Hash let a context policy filter by artifact
// kind and let the engine record what a Worker actually saw (REQ-CTXPOL-03).
type NodeInput struct {
	FromNode string
	Content  []byte
	Type     domain.ArtifactType
	Hash     string
}

// NodeRequest is the input to one NodeExecutor call. RetryFeedback is empty on
// the first attempt and, on a contract-violation retry, carries the prior
// validation errors — the delta the executor appends to the next model call
// (PRIN-05), the only channel by which feedback flows back into the executor.
type NodeRequest struct {
	Node          domain.Node
	Inputs        []NodeInput
	RetryFeedback string
}

// NodeResult is what a NodeExecutor returns for one node. Hash is filled in by
// the engine after the content is written to the artifact store. Validated marks
// that the executor enforced a contract on this output (so the engine emits
// ContractValidated); ContextHashes records the artifacts the context policy
// admitted, for the audit trail (REQ-CTXPOL-03).
type NodeResult struct {
	Content       []byte
	Type          domain.ArtifactType
	MimeType      string
	CostUSD       float64
	Tokens        int64
	Hash          string // set by the engine, not the executor
	Validated     bool
	ContextHashes []string
}

// NodeExecutor runs a single node. It is the seam the Worker/Contract/model
// layer plugs into without the scheduler changing: the scheduler owns graph
// traversal, retries, budget, and events; the executor owns "what a node
// actually does". Implementations must respect ctx cancellation and classify
// their errors with Transient/ContractViolation/Fatal (see retry.go) so the
// scheduler can decide whether to retry.
type NodeExecutor interface {
	Execute(ctx context.Context, req NodeRequest) (NodeResult, error)
}

// CacheKeyer is an optional NodeExecutor capability: it derives a node's cache
// key from its definition and resolved inputs (REQ-CACHE-01). An executor that
// implements it (the model-backed WorkerExecutor does) opts its nodes into the
// cache; one that doesn't (stub/tool executors) simply never caches. Returning
// ok=false means "this node is not cacheable" — always execute.
type CacheKeyer interface {
	CacheKey(node domain.Node, inputs []NodeInput) (key string, ok bool)
}

// executeNode runs one node with retries, stores its artifact, and emits the
// WorkerStarted / ArtifactCreated / WorkerFinished (or Retry / Failure) events.
// runNode is the node actually executed; logicalID is the graph node the result
// is attributed to (they differ only for a fallback substitution).
func (s *Scheduler) executeNode(
	ctx context.Context,
	execID string,
	runNode domain.Node,
	logicalID string,
	inputs []NodeInput,
	maxRetries int,
	backoff backoffFunc,
	cacheMode CacheMode,
) (NodeResult, error) {
	s.emit(execID, domain.WorkerStarted, logicalID, nil)

	// Cache check, before any model call (REQ-CACHE-02). A cacheable node whose
	// key matches a prior run returns the recorded artifact byte-identically at
	// zero cost; on a miss we remember the key to record the entry after a
	// successful run. cacheKey is "" when the node isn't cacheable or caching is
	// off — then this whole block is inert.
	cacheKey := s.cacheKeyFor(runNode, inputs, cacheMode)
	if cacheKey != "" && (cacheMode == CacheOn || cacheMode == CacheReadOnly) {
		if hit, ok := s.cacheHit(execID, logicalID, cacheKey); ok {
			return hit, nil
		}
	}
	if cacheKey != "" {
		s.emit(execID, domain.CacheMiss, logicalID, map[string]any{"key": cacheKey})
	}

	// feedback carries a contract violation's validation errors from one attempt
	// into the next (the executor rebuilds its messages with the delta). It stays
	// on this goroutine's stack — the executor never holds cross-attempt state.
	var res NodeResult
	var feedback string
	err := withRetry(ctx, maxRetries, backoff, func() error {
		r, e := s.exec.Execute(ctx, NodeRequest{Node: runNode, Inputs: inputs, RetryFeedback: feedback})
		if e == nil {
			res = r
			return nil
		}
		var cve contractViolationError
		if errors.As(e, &cve) {
			feedback = cve.Feedback
		}
		return e
	}, func(attempt int, reason string) {
		s.emit(execID, domain.Retry, logicalID, map[string]any{"attempt": attempt, "reason": reason})
	})
	if err != nil {
		// A terminal contract violation gets its own explicit event before the
		// generic Failure (REQ-CONTRACT-03) — never a silent pass-through.
		if isContractViolation(err) {
			s.emit(execID, domain.ContractViolation, logicalID, map[string]any{"error": err.Error()})
		}
		s.emit(execID, domain.Failure, logicalID, map[string]any{"error": err.Error()})
		return NodeResult{}, err
	}

	hash, err := s.store.Put(res.Content)
	if err != nil {
		wrapped := fmt.Errorf("store node %q artifact: %w", logicalID, err)
		s.emit(execID, domain.Failure, logicalID, map[string]any{"error": wrapped.Error()})
		return NodeResult{}, wrapped
	}
	res.Hash = hash

	// The output cleared its contract before any downstream node can see it
	// (REQ-WORKER-03). Stub executors leave Validated false and emit no event.
	if res.Validated {
		s.emit(execID, domain.ContractValidated, logicalID, nil)
	}
	s.emit(execID, domain.ArtifactCreated, logicalID, map[string]any{
		"hash": hash,
		"type": string(res.Type),
	})
	finished := map[string]any{"costUsd": res.CostUSD, "tokens": res.Tokens}
	if len(res.ContextHashes) > 0 {
		// What this Worker was actually allowed to see, by hash (REQ-CTXPOL-03).
		finished["contextHashes"] = res.ContextHashes
	}
	s.emit(execID, domain.WorkerFinished, logicalID, finished)

	// Record the entry so a future run with the same key skips the model
	// (REQ-CACHE-02). Only in on mode — readonly reads hits but never writes.
	if cacheKey != "" && cacheMode == CacheOn {
		_ = s.cache.Put(cache.Entry{
			Key:          cacheKey,
			ArtifactHash: hash,
			ArtifactType: res.Type,
			CostUSD:      res.CostUSD,
			Tokens:       res.Tokens,
			CreatedAt:    s.now().UTC().Format(time.RFC3339Nano),
		})
	}
	return res, nil
}

// cacheKeyFor returns the node's cache key, or "" if caching is off or the
// executor doesn't opt the node in (not a CacheKeyer, or ok=false).
func (s *Scheduler) cacheKeyFor(node domain.Node, inputs []NodeInput, mode CacheMode) string {
	if mode == CacheOff || s.cache == nil {
		return ""
	}
	keyer, ok := s.exec.(CacheKeyer)
	if !ok {
		return ""
	}
	key, ok := keyer.CacheKey(node, inputs)
	if !ok {
		return ""
	}
	return key
}

// cacheHit looks key up; on a hit it loads the recorded artifact, emits
// CacheHit + a reconstructed ArtifactCreated/WorkerFinished pair at zero cost,
// and returns the result so downstream nodes read the cached artifact. A missing
// artifact (store cleared under the index) degrades to a miss. Events are
// reconstructed fresh rather than replayed verbatim: a stored event stream would
// carry a stale executionID and break the new log's hash chain (ADR 0007).
func (s *Scheduler) cacheHit(execID, logicalID, key string) (NodeResult, bool) {
	entry, ok := s.cache.Get(key)
	if !ok {
		return NodeResult{}, false
	}
	content, err := s.store.Get(entry.ArtifactHash)
	if err != nil {
		return NodeResult{}, false // index references bytes the store no longer has
	}
	s.emit(execID, domain.CacheHit, logicalID, map[string]any{
		"key":          key,
		"savedCostUsd": entry.CostUSD,
		"savedTokens":  entry.Tokens,
	})
	s.emit(execID, domain.ArtifactCreated, logicalID, map[string]any{
		"hash": entry.ArtifactHash,
		"type": string(entry.ArtifactType),
	})
	s.emit(execID, domain.WorkerFinished, logicalID, map[string]any{"costUsd": 0.0, "tokens": int64(0)})
	return NodeResult{
		Content: content,
		Type:    entry.ArtifactType,
		Hash:    entry.ArtifactHash,
		CostUSD: 0,
		Tokens:  0,
	}, true
}

// isContractViolation reports whether err (or anything it wraps) is a contract
// violation.
func isContractViolation(err error) bool {
	var cve contractViolationError
	return errors.As(err, &cve)
}

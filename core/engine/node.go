package engine

import (
	"context"
	"errors"
	"fmt"

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
) (NodeResult, error) {
	s.emit(execID, domain.WorkerStarted, logicalID, nil)

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
	return res, nil
}

// isContractViolation reports whether err (or anything it wraps) is a contract
// violation.
func isContractViolation(err error) bool {
	var cve contractViolationError
	return errors.As(err, &cve)
}

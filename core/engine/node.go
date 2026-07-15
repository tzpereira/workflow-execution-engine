package engine

import (
	"context"
	"fmt"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
)

// NodeInput is one upstream artifact made available to a node, carried by an
// active incoming edge.
type NodeInput struct {
	FromNode string
	Content  []byte
}

// NodeResult is what a NodeExecutor returns for one node. Hash is filled in by
// the engine after the content is written to the artifact store.
type NodeResult struct {
	Content  []byte
	Type     domain.ArtifactType
	MimeType string
	CostUSD  float64
	Tokens   int64
	Hash     string // set by the engine, not the executor
}

// NodeExecutor runs a single node. It is the seam the Worker/Contract/model
// layer (M1.4) plugs into without the scheduler changing: the scheduler owns
// graph traversal, retries, budget, and events; the executor owns "what a node
// actually does". Implementations must respect ctx cancellation and classify
// their errors with Transient/ContractViolation/Fatal (see retry.go) so the
// scheduler can decide whether to retry.
type NodeExecutor interface {
	Execute(ctx context.Context, node domain.Node, inputs []NodeInput) (NodeResult, error)
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

	var res NodeResult
	err := withRetry(ctx, maxRetries, backoff, func(int) error {
		var e error
		res, e = s.exec.Execute(ctx, runNode, inputs)
		return e
	}, func(attempt int, reason string) {
		s.emit(execID, domain.Retry, logicalID, map[string]any{"attempt": attempt, "reason": reason})
	})
	if err != nil {
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

	s.emit(execID, domain.ArtifactCreated, logicalID, map[string]any{
		"hash": hash,
		"type": string(res.Type),
	})
	s.emit(execID, domain.WorkerFinished, logicalID, map[string]any{
		"costUsd": res.CostUSD,
		"tokens":  res.Tokens,
	})
	return res, nil
}

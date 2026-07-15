package engine

import (
	"context"
	"fmt"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
)

// snapshot is the frozen graph + config written at ExecutionStarted and read
// back by Resume. It is what makes an execution replayable without re-resolving
// anything live (M1.7 builds on the same file).
type snapshot struct {
	Workflow    domain.Workflow `json:"workflow"`
	Budget      domain.Budget   `json:"budget"`
	Concurrency int             `json:"concurrency"`
}

// Resume restarts an execution from its recorded state. It reads the snapshot
// and event log, treats every node with a recorded WorkerFinished as already
// done (reusing its persisted artifact), and runs the rest — so finished nodes
// are never re-executed. It appends to the same execution's log.
func (s *Scheduler) Resume(ctx context.Context, executionID string) (*Result, error) {
	var snap snapshot
	if err := s.log.ReadSnapshot(executionID, &snap); err != nil {
		return nil, fmt.Errorf("engine: resume %s: %w", executionID, err)
	}

	events, err := s.log.ReadAll(executionID)
	if err != nil {
		return nil, fmt.Errorf("engine: resume %s: %w", executionID, err)
	}

	// A node is done iff it recorded a WorkerFinished; its artifact hash comes
	// from the ArtifactCreated that precedes it.
	hashByNode := make(map[string]string)
	typeByNode := make(map[string]domain.ArtifactType)
	finished := make(map[string]bool)
	for _, ev := range events {
		switch ev.Type {
		case domain.ArtifactCreated:
			if h, ok := ev.Payload["hash"].(string); ok {
				hashByNode[ev.NodeID] = h
			}
			if t, ok := ev.Payload["type"].(string); ok {
				typeByNode[ev.NodeID] = domain.ArtifactType(t)
			}
		case domain.WorkerFinished:
			finished[ev.NodeID] = true
		}
	}

	precompleted := make(map[string]nodeOutput, len(finished))
	for nodeID := range finished {
		hash := hashByNode[nodeID]
		if hash == "" {
			// Finished without a recorded artifact — cannot reuse it; let it re-run.
			continue
		}
		content, err := s.store.Get(hash)
		if err != nil {
			return nil, fmt.Errorf("engine: resume %s: reload artifact for node %q: %w", executionID, nodeID, err)
		}
		precompleted[nodeID] = nodeOutput{Hash: hash, Content: content, Type: typeByNode[nodeID]}
	}

	opts := RunOptions{
		ExecutionID: executionID,
		Concurrency: snap.Concurrency,
		Budget:      snap.Budget,
	}
	return s.run(ctx, &snap.Workflow, opts, precompleted, false)
}

package validate_test

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/serialize"
	"github.com/tzpereira/workflow-execution-engine/core/validate"
)

func TestGraphAcceptsValidDiamond(t *testing.T) {
	wf, err := serialize.LoadWorkflow(filepath.Join("..", "serialize", "testdata", "workflow.yaml"))
	if err != nil {
		t.Fatal(err)
	}
	if err := validate.Graph(wf, nil); err != nil {
		t.Errorf("valid diamond graph rejected:\n%v", err)
	}
}

func TestGraphRejectsUnresolvedEdge(t *testing.T) {
	path := filepath.Join("testdata", "unresolved-edge.yaml")
	wf, err := serialize.LoadWorkflow(path)
	if err != nil {
		t.Fatal(err)
	}
	src, err := serialize.LoadSource(path)
	if err != nil {
		t.Fatal(err)
	}

	err = validate.Graph(wf, src)
	if err == nil {
		t.Fatal("expected an error for an edge pointing at a non-existent node")
	}
	var ge *validate.GraphError
	if !errors.As(err, &ge) {
		t.Fatalf("expected *validate.GraphError, got %T", err)
	}

	msg := err.Error()
	if !strings.Contains(msg, "ghost") {
		t.Errorf("error should name the unresolved node id 'ghost':\n%s", msg)
	}
	if !strings.Contains(msg, "line 10") {
		t.Errorf("error should cite the edge's source line (10):\n%s", msg)
	}
}

func TestGraphRejectsCycle(t *testing.T) {
	path := filepath.Join("testdata", "cycle.yaml")
	wf, err := serialize.LoadWorkflow(path)
	if err != nil {
		t.Fatal(err)
	}
	if err := validate.Graph(wf, nil); err == nil {
		t.Fatal("expected an error for a cyclic graph")
	} else if !strings.Contains(err.Error(), "a -> b -> c -> a") {
		t.Errorf("error should name the cycle a -> b -> c -> a:\n%v", err)
	}
}

func TestGraphRejectsOrphan(t *testing.T) {
	wf := &domain.Workflow{
		ID: "orphaned", Version: "1.0.0",
		Nodes: []domain.Node{
			{ID: "a", Worker: "w@1"},
			{ID: "b", Worker: "w@1"},
			{ID: "island", Worker: "w@1"},
		},
		Edges:  []domain.Edge{{From: "a", To: "b"}},
		Budget: domain.Budget{MaxCostUSD: 1, MaxTokens: 1, MaxDurationMs: 1, MaxRetriesPerNode: 1},
	}
	err := validate.Graph(wf, nil)
	if err == nil || !strings.Contains(err.Error(), `"island" is an orphan`) {
		t.Errorf("expected an orphan error naming 'island', got: %v", err)
	}
}

func TestGraphRejectsContextArtifactNotUpstream(t *testing.T) {
	// c reads an artifact from b, but b is a sibling (not upstream of c).
	wf := &domain.Workflow{
		ID: "ctx", Version: "1.0.0",
		Nodes: []domain.Node{
			{ID: "a", Worker: "w@1"},
			{ID: "b", Worker: "w@1"},
			{ID: "c", Worker: "w@1", ContextPolicy: &domain.ContextPolicy{
				Mode:   domain.ContextArtifacts,
				Params: &domain.ContextPolicyParams{Artifacts: []string{"b"}},
			}},
		},
		Edges: []domain.Edge{
			{From: "a", To: "b"},
			{From: "a", To: "c"},
		},
		Budget: domain.Budget{MaxCostUSD: 1, MaxTokens: 1, MaxDurationMs: 1, MaxRetriesPerNode: 1},
	}
	err := validate.Graph(wf, nil)
	if err == nil || !strings.Contains(err.Error(), "not upstream") {
		t.Errorf("expected an upstream-artifact error, got: %v", err)
	}
}

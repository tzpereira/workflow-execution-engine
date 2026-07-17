package examples_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/serialize"
	"github.com/tzpereira/workflow-execution-engine/core/validate"
)

// TestExamplesAreValid loads every shipped example and validates it against the
// domain schemas, so an example can never drift from the model (REQ-CONTRACT-04
// verification: the shipped templates are real, well-formed definitions).
func TestExamplesAreValid(t *testing.T) {
	v, err := validate.NewValidator()
	if err != nil {
		t.Fatalf("NewValidator: %v", err)
	}

	workflow := readWorkflow(t, "pr-review/workflow.yaml")
	if err := v.Validate(validate.KindWorkflow, workflow, nil); err != nil {
		t.Errorf("workflow.yaml failed schema validation:\n%v", err)
	}
	if err := validate.Graph(&workflow, nil); err != nil {
		t.Errorf("workflow.yaml failed graph validation:\n%v", err)
	}

	worker := readWorker(t, "pr-review/reviewer.worker.yaml")
	if err := v.Validate(validate.KindWorker, worker, nil); err != nil {
		t.Errorf("reviewer.worker.yaml failed schema validation:\n%v", err)
	}

	// The Worker's output contract must be a compilable JSON Schema.
	if _, err := validate.CompileSchema(worker.Contract.OutputSchema); err != nil {
		t.Errorf("reviewer output schema does not compile: %v", err)
	}

	ghWorkflow := readWorkflow(t, "github-pr-review/workflow.yaml")
	if err := v.Validate(validate.KindWorkflow, ghWorkflow, nil); err != nil {
		t.Errorf("github-pr-review/workflow.yaml failed schema validation:\n%v", err)
	}
	if err := validate.Graph(&ghWorkflow, nil); err != nil {
		t.Errorf("github-pr-review/workflow.yaml failed graph validation:\n%v", err)
	}
	for _, n := range ghWorkflow.Nodes {
		if n.Tool == nil {
			t.Errorf("github-pr-review node %q should be tool-backed", n.ID)
		}
	}
}

// TestExampleContractsAreTight locks in REQ-CONTRACT-04: the flagship example's
// output schema uses bounded arrays, bounded strings, and enums — the anti-slop
// shape templates inherit. A future example that drops these bounds fails here.
func TestExampleContractsAreTight(t *testing.T) {
	worker := readWorker(t, "pr-review/reviewer.worker.yaml")
	raw, err := serialize.MarshalYAML(worker.Contract.OutputSchema)
	if err != nil {
		t.Fatalf("marshal schema: %v", err)
	}
	schema := string(raw)
	for _, marker := range []string{"maxItems", "maxLength", "enum"} {
		if !strings.Contains(schema, marker) {
			t.Errorf("tight-contract marker %q missing from the reviewer output schema (anti-slop, REQ-CONTRACT-04)", marker)
		}
	}
}

func readWorkflow(t *testing.T, rel string) domain.Workflow {
	t.Helper()
	var wf domain.Workflow
	if err := serialize.UnmarshalYAML(readFile(t, rel), &wf); err != nil {
		t.Fatalf("decode %s: %v", rel, err)
	}
	return wf
}

func readWorker(t *testing.T, rel string) domain.Worker {
	t.Helper()
	var w domain.Worker
	if err := serialize.UnmarshalYAML(readFile(t, rel), &w); err != nil {
		t.Fatalf("decode %s: %v", rel, err)
	}
	return w
}

func readFile(t *testing.T, rel string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.FromSlash(rel))
	if err != nil {
		t.Fatalf("read %s: %v", rel, err)
	}
	return data
}

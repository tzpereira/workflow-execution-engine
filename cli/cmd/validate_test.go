package cmd

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// execCLI runs the CLI in-process with the given args, returning combined
// output and the (possibly coded) error — the same error Main translates to an
// exit code. Every command test drives the real cobra tree this way.
func execCLI(t *testing.T, args ...string) (string, error) {
	t.Helper()
	root := newRootCmd()
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetErr(&out)
	root.SetArgs(args)
	err := root.Execute()
	return out.String(), err
}

func writeTemp(t *testing.T, name, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", name, err)
	}
	return path
}

const validWorkflow = `id: hello
version: 1.0.0
nodes:
  - id: greet
    worker: greeter@1.0.0
edges: []
budget:
  maxCostUsd: 1.0
  maxTokens: 1000
  maxDurationMs: 30000
  maxRetriesPerNode: 1
`

func TestValidateAcceptsGoodWorkflow(t *testing.T) {
	path := writeTemp(t, "wf.yaml", validWorkflow)
	out, err := execCLI(t, "validate", path)
	if err != nil {
		t.Fatalf("validate a good workflow returned: %v", err)
	}
	if !strings.Contains(out, "valid") {
		t.Errorf("expected a 'valid' line, got: %q", out)
	}
}

func TestValidateRejectsWithExitCode3(t *testing.T) {
	// A node that declares neither worker nor tool fails graph validation.
	bad := "id: bad\nversion: 1.0.0\nnodes:\n  - id: orphan\nbudget:\n  maxCostUsd: 1\n  maxTokens: 1\n  maxDurationMs: 1\n  maxRetriesPerNode: 0\n"
	path := writeTemp(t, "bad.yaml", bad)

	_, err := execCLI(t, "validate", path)
	if err == nil {
		t.Fatal("validating an invalid workflow should error")
	}
	var ce *CodedError
	if !errors.As(err, &ce) {
		t.Fatalf("want *CodedError, got %T: %v", err, err)
	}
	if ce.Code != ExitValidation {
		t.Errorf("exit code = %d, want %d (validation)", ce.Code, ExitValidation)
	}
}

func TestExitCodeMapping(t *testing.T) {
	if got := exitCode(nil); got != ExitOK {
		t.Errorf("exitCode(nil) = %d, want %d", got, ExitOK)
	}
	if got := exitCode(&CodedError{Code: ExitBudget, Err: errors.New("boom")}); got != ExitBudget {
		t.Errorf("coded exit not honored: got %d, want %d", got, ExitBudget)
	}
	if got := exitCode(errors.New("plain")); got != ExitNodeFailure {
		t.Errorf("a plain error should map to %d, got %d", ExitNodeFailure, got)
	}
}

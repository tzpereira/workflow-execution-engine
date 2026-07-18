package cmd

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/engine"
	"github.com/tzpereira/workflow-execution-engine/core/eventlog"
)

func TestServeCommandRegistered(t *testing.T) {
	root := newRootCmd()
	for _, c := range root.Commands() {
		if c.Name() == "serve" {
			return
		}
	}
	t.Fatal("serve command is not registered on root")
}

// TestRunStarterExecutesInBackground drives the exact closure `wee serve` hands
// the HTTP server: it must resolve a tool-only workflow (no API key needed),
// return an execution id immediately, and run to completion in the background,
// writing the terminal ExecutionFinished event to the log the live stream tails.
func TestRunStarterExecutesInBackground(t *testing.T) {
	dir := t.TempDir()
	writeFile(t, filepath.Join(dir, "check.yaml"), `id: build-check
version: 1.0.0
nodes:
  - id: check
    tool:
      toolName: terminal
      input:
        command: echo
        args: ["ok"]
edges: []
budget: {maxCostUsd: 0, maxTokens: 0, maxDurationMs: 30000, maxRetriesPerNode: 1}
`)
	writeFile(t, filepath.Join(dir, "wee.yaml"), "terminal:\n  allow: [\"echo\"]\n  timeoutMs: 5000\n")

	workspace := filepath.Join(dir, ".workflow")
	start := runStarter(dir, workspace, engine.CacheMode("on"))

	execID, err := start("check.yaml")
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	if execID == "" {
		t.Fatal("empty execution id")
	}

	// The run is asynchronous; poll the log (as the WebSocket handler does) for the
	// terminal event.
	log := eventlog.New(workspace)
	deadline := time.Now().Add(3 * time.Second)
	for {
		events, err := log.ReadAll(execID)
		if err == nil && len(events) > 0 && events[len(events)-1].Type == domain.ExecutionFinished {
			if st, _ := events[len(events)-1].Payload["state"].(string); st != string(domain.ExecutionSucceeded) {
				t.Fatalf("run finished in state %q, want succeeded", st)
			}
			return
		}
		if time.Now().After(deadline) {
			t.Fatalf("run did not finish; last events: %+v", events)
		}
		time.Sleep(10 * time.Millisecond)
	}
}

func TestRunStarterRejectsMissingWorkflow(t *testing.T) {
	dir := t.TempDir()
	start := runStarter(dir, filepath.Join(dir, ".workflow"), engine.CacheMode("on"))
	if _, err := start("does-not-exist.yaml"); err == nil {
		t.Fatal("expected an error for a missing workflow file")
	}
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

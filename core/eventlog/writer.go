// Package eventlog is the append-only, per-execution event log plus the frozen
// execution snapshot. Together they make an execution directory
// (<baseDir>/executions/<id>/) self-sufficient: its full timeline can be
// reconstructed from disk alone, with no in-process state — the foundation
// audit replay (M1.7) is built on.
package eventlog

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
)

const (
	eventsFile   = "events.jsonl"
	snapshotFile = "snapshot.json"
)

// Log reads and writes execution records under <baseDir>/executions.
type Log struct {
	baseDir string
	mu      sync.Mutex // serializes appends so concurrent lines never interleave
}

// New returns a Log rooted at <baseDir>/executions. baseDir is the workspace
// root (conventionally ".workflow").
func New(baseDir string) *Log {
	return &Log{baseDir: baseDir}
}

// dir returns the directory for an execution, creating it if needed.
func (l *Log) dir(executionID string) (string, error) {
	d := filepath.Join(l.baseDir, "executions", executionID)
	if err := os.MkdirAll(d, 0o755); err != nil {
		return "", fmt.Errorf("eventlog: create %s: %w", d, err)
	}
	return d, nil
}

// Append writes ev as one JSON line to the execution's events.jsonl. Appends
// are serialized, so lines are never interleaved under concurrent writers.
func (l *Log) Append(executionID string, ev domain.Event) error {
	line, err := json.Marshal(ev)
	if err != nil {
		return fmt.Errorf("eventlog: marshal event: %w", err)
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	d, err := l.dir(executionID)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(filepath.Join(d, eventsFile), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return fmt.Errorf("eventlog: open log: %w", err)
	}
	defer f.Close()

	if _, err := f.Write(append(line, '\n')); err != nil {
		return fmt.Errorf("eventlog: append: %w", err)
	}
	return nil
}

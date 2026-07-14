package domain

import "time"

// EventType is the enum of event kinds. The v1 event catalog constants are
// defined in M1.2 alongside the event log.
type EventType string

// Event is an immutable, timestamped record of something that happened during
// an Execution. Events form the append-only log that powers replay.
type Event struct {
	Type        EventType      `json:"type" yaml:"type"`
	Timestamp   time.Time      `json:"timestamp" yaml:"timestamp"`
	ExecutionID string         `json:"executionId" yaml:"executionId"`
	NodeID      string         `json:"nodeId,omitempty" yaml:"nodeId,omitempty"`
	Payload     map[string]any `json:"payload,omitempty" yaml:"payload,omitempty"`
}

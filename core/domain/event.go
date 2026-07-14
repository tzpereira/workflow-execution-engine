package domain

import "time"

// EventType is the enum of event kinds.
type EventType string

// The v1 event catalog. Every observable moment in an Execution is one of
// these (VISION.md "Event System"); nothing merges without emitting events
// (ROADMAP standing rule #2).
const (
	ExecutionStarted  EventType = "ExecutionStarted"
	ExecutionFinished EventType = "ExecutionFinished"
	WorkerStarted     EventType = "WorkerStarted"
	WorkerFinished    EventType = "WorkerFinished"
	ToolCalled        EventType = "ToolCalled"
	ToolResult        EventType = "ToolResult"
	ArtifactCreated   EventType = "ArtifactCreated"
	ContractValidated EventType = "ContractValidated"
	ContractViolation EventType = "ContractViolation"
	Retry             EventType = "Retry"
	Failure           EventType = "Failure"
	CacheHit          EventType = "CacheHit"
	CacheMiss         EventType = "CacheMiss"
	BudgetWarning     EventType = "BudgetWarning"
	BudgetExceeded    EventType = "BudgetExceeded"
	Cancelled         EventType = "Cancelled"
)

// Event is an immutable, timestamped record of something that happened during
// an Execution. Events form the append-only log that powers replay.
type Event struct {
	Type        EventType      `json:"type" yaml:"type"`
	Timestamp   time.Time      `json:"timestamp" yaml:"timestamp"`
	ExecutionID string         `json:"executionId" yaml:"executionId"`
	NodeID      string         `json:"nodeId,omitempty" yaml:"nodeId,omitempty"`
	Payload     map[string]any `json:"payload,omitempty" yaml:"payload,omitempty"`
}

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
	ApprovalRequested EventType = "ApprovalRequested"
	ApprovalGranted   EventType = "ApprovalGranted"
	ApprovalRejected  EventType = "ApprovalRejected"
	Cancelled         EventType = "Cancelled"
)

// Event is an immutable, timestamped record of something that happened during
// an Execution. Events form the append-only log that powers replay.
//
// PrevHash chains each event to its predecessor (the canonical SHA-256 of the
// event written just before it; the first event chains from the execution
// snapshot's hash). It is set by eventlog.Append, never by callers, and makes
// the log tamper-evident: any edit, deletion, or reorder breaks the chain and
// is caught by eventlog.Verify (ADR 0007, REQ-EVENT-03).
type Event struct {
	Type        EventType      `json:"type" yaml:"type"`
	Timestamp   time.Time      `json:"timestamp" yaml:"timestamp"`
	ExecutionID string         `json:"executionId" yaml:"executionId"`
	NodeID      string         `json:"nodeId,omitempty" yaml:"nodeId,omitempty"`
	PrevHash    string         `json:"prevHash" yaml:"prevHash"`
	Payload     map[string]any `json:"payload,omitempty" yaml:"payload,omitempty"`
}

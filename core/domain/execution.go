package domain

import "time"

// ExecutionState is the enum of an Execution's lifecycle states.
type ExecutionState string

const (
	ExecutionPending   ExecutionState = "pending"
	ExecutionRunning   ExecutionState = "running"
	ExecutionSucceeded ExecutionState = "succeeded"
	ExecutionFailed    ExecutionState = "failed"
	ExecutionCancelled ExecutionState = "cancelled"
)

// BudgetStatus is the running consumption of an Execution against its Budget.
type BudgetStatus struct {
	Limit        Budget  `json:"limit" yaml:"limit"`
	SpentCostUSD float64 `json:"spentCostUsd" yaml:"spentCostUsd"`
	SpentTokens  int64   `json:"spentTokens" yaml:"spentTokens"`
	ElapsedMs    int64   `json:"elapsedMs" yaml:"elapsedMs"`
}

// Execution is a single run of a Workflow. Graph is the workflow snapshot
// frozen at start (what audit replay reads); WorkflowRef pins "id@version".
type Execution struct {
	ID          string         `json:"id" yaml:"id"`
	WorkflowRef string         `json:"workflowRef" yaml:"workflowRef"`
	State       ExecutionState `json:"state" yaml:"state"`
	Graph       Workflow       `json:"graph" yaml:"graph"`
	Budget      BudgetStatus   `json:"budget" yaml:"budget"`
	StartedAt   time.Time      `json:"startedAt" yaml:"startedAt"`
	FinishedAt  *time.Time     `json:"finishedAt,omitempty" yaml:"finishedAt,omitempty"`
}

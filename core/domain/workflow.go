package domain

// ToolCall makes a Node tool-backed instead of Worker-backed (ADR 0008): the
// engine invokes ToolName deterministically with Input, and no model ever
// selects or shapes that input (ADR 0006). Input leaf values may be the
// whole-string placeholders "${nodeID.path}" (an upstream artifact field) or
// "${env:NAME}" (an OS environment variable, resolved at call time and never
// persisted) — see core/engine/tool_input.go.
type ToolCall struct {
	ToolName string         `json:"toolName" yaml:"toolName"`
	Input    map[string]any `json:"input" yaml:"input"`
}

// Node is a placed Worker or Tool call in a Workflow graph — exactly one of
// Worker or Tool is set (core/validate/graph.go enforces this). Worker is a
// reference of the form "id@version" into an LLM-backed role; Tool runs a
// deterministic tool call instead (ADR 0008) — Worker itself is untouched by
// this distinction, it still means exactly what spec/workers.md says.
// ContextPolicy, when set, overrides the referenced Worker's policy for this
// placement (Worker-backed nodes only) and is what graph validation reads.
// OnFailure sets what the runtime does if the node fails (default: fail the
// whole execution).
type Node struct {
	ID            string         `json:"id" yaml:"id"`
	Worker        string         `json:"worker,omitempty" yaml:"worker,omitempty"`
	Tool          *ToolCall      `json:"tool,omitempty" yaml:"tool,omitempty"`
	ContextPolicy *ContextPolicy `json:"contextPolicy,omitempty" yaml:"contextPolicy,omitempty"`
	OnFailure     *FailurePolicy `json:"onFailure,omitempty" yaml:"onFailure,omitempty"`
}

// Edge is a directed dependency: To runs after From and may read its output.
// A non-nil Condition makes the edge conditional — it is traversed only if the
// predicate holds against From's output artifact.
type Edge struct {
	From      string     `json:"from" yaml:"from"`
	To        string     `json:"to" yaml:"to"`
	Condition *Condition `json:"condition,omitempty" yaml:"condition,omitempty"`
}

// CompareOp is the operator of a conditional-edge predicate.
type CompareOp string

const (
	OpEq     CompareOp = "eq"     // value at Path equals Value
	OpNe     CompareOp = "ne"     // value at Path does not equal Value
	OpGt     CompareOp = "gt"     // numeric: value > Value
	OpGte    CompareOp = "gte"    // numeric: value >= Value
	OpLt     CompareOp = "lt"     // numeric: value < Value
	OpLte    CompareOp = "lte"    // numeric: value <= Value
	OpExists CompareOp = "exists" // Path resolves to a value (Value ignored)
	OpTruthy CompareOp = "truthy" // Path resolves to a truthy value (Value ignored)
)

// Condition is a predicate on an upstream node's output artifact (parsed as
// JSON). Path is a dotted path into that JSON (e.g. "score" or "result.passed",
// with numeric segments indexing arrays); Op compares the value found at Path
// against Value. Evaluated by core/engine/conditional.go.
type Condition struct {
	Path  string    `json:"path" yaml:"path"`
	Op    CompareOp `json:"op" yaml:"op"`
	Value any       `json:"value,omitempty" yaml:"value,omitempty"`
}

// FailureMode is what the runtime does when a node fails after exhausting its
// retries.
type FailureMode string

const (
	FailExecution FailureMode = "fail-execution" // halt the whole execution (default)
	FailContinue  FailureMode = "continue"       // mark the node failed, keep independent branches running
	FailFallback  FailureMode = "fallback-node"  // run FallbackNode in the failed node's place
)

// FailurePolicy is a node's failure handling. FallbackNode is required only for
// the "fallback-node" mode.
type FailurePolicy struct {
	Mode         FailureMode `json:"mode" yaml:"mode"`
	FallbackNode string      `json:"fallbackNode,omitempty" yaml:"fallbackNode,omitempty"`
}

// Defaults are values applied to nodes that do not specify their own.
type Defaults struct {
	Model         *ModelConfig   `json:"model,omitempty" yaml:"model,omitempty"`
	ContextPolicy *ContextPolicy `json:"contextPolicy,omitempty" yaml:"contextPolicy,omitempty"`
}

// Workflow is a versioned, serializable graph of Nodes and Edges. It is the
// unit of authorship, versioning, and execution.
type Workflow struct {
	ID       string    `json:"id" yaml:"id"`
	Version  string    `json:"version" yaml:"version"`
	Nodes    []Node    `json:"nodes" yaml:"nodes"`
	Edges    []Edge    `json:"edges" yaml:"edges"`
	Defaults *Defaults `json:"defaults,omitempty" yaml:"defaults,omitempty"`
	Budget   Budget    `json:"budget" yaml:"budget"`
}

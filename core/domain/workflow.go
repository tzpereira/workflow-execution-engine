package domain

// Node is a placed Worker in a Workflow graph. Worker is a reference of the
// form "id@version". ContextPolicy, when set, overrides the referenced Worker's
// policy for this placement and is what graph validation reads.
type Node struct {
	ID            string         `json:"id" yaml:"id"`
	Worker        string         `json:"worker" yaml:"worker"`
	ContextPolicy *ContextPolicy `json:"contextPolicy,omitempty" yaml:"contextPolicy,omitempty"`
}

// Edge is a directed dependency: To runs after From and may read its output.
type Edge struct {
	From string `json:"from" yaml:"from"`
	To   string `json:"to" yaml:"to"`
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

package domain

// ModelConfig is a Worker's model selection and call parameters. Params is
// free-form (temperature, max tokens, etc.) and passes through to the provider.
type ModelConfig struct {
	Provider string         `json:"provider" yaml:"provider"`
	Model    string         `json:"model" yaml:"model"`
	Params   map[string]any `json:"params,omitempty" yaml:"params,omitempty"`
}

// Worker represents a role in a Workflow. It is interchangeable: its behaviour
// is fully described by its objective, constraints, tools, context policy, and
// output contract.
type Worker struct {
	ID            string        `json:"id" yaml:"id"`
	Version       string        `json:"version" yaml:"version"`
	Description   string        `json:"description,omitempty" yaml:"description,omitempty"`
	Objective     string        `json:"objective" yaml:"objective"`
	Constraints   []string      `json:"constraints" yaml:"constraints"`
	Tools         []string      `json:"tools" yaml:"tools"`
	ContextPolicy ContextPolicy `json:"contextPolicy" yaml:"contextPolicy"`
	Contract      Contract      `json:"contract" yaml:"contract"`
	Model         ModelConfig   `json:"model" yaml:"model"`
}

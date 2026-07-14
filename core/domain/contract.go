package domain

// Contract is the enforced specification of a Worker's output. Every output is
// validated against OutputSchema; an invalid output triggers a retry with the
// validation error as feedback, and repeated failure fails the node.
type Contract struct {
	Goal            string         `json:"goal" yaml:"goal"`
	Rules           []string       `json:"rules" yaml:"rules"`
	OutputSchema    map[string]any `json:"outputSchema" yaml:"outputSchema"`
	SuccessCriteria []string       `json:"successCriteria" yaml:"successCriteria"`
	MaxRetries      int            `json:"maxRetries" yaml:"maxRetries"`
}

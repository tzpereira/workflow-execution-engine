package domain

// Budget declares the hard limits for an Execution. The runtime enforces these
// and fails fast with a clear Event rather than allowing a silent overrun.
type Budget struct {
	MaxCostUSD        float64 `json:"maxCostUsd" yaml:"maxCostUsd"`
	MaxTokens         int64   `json:"maxTokens" yaml:"maxTokens"`
	MaxDurationMs     int64   `json:"maxDurationMs" yaml:"maxDurationMs"`
	MaxRetriesPerNode int     `json:"maxRetriesPerNode" yaml:"maxRetriesPerNode"`
}

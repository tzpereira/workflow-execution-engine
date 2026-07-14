package domain

// ContextMode is the enum of what a Worker is allowed to read.
type ContextMode string

const (
	ContextFull       ContextMode = "full"
	ContextParentOnly ContextMode = "parent-only"
	ContextArtifacts  ContextMode = "artifacts"
	ContextDiffOnly   ContextMode = "diff-only"
	ContextSummary    ContextMode = "summary"
	ContextNone       ContextMode = "none"
)

// ContextPolicy is the per-Worker declaration of what context it may access.
// The resolved slice is logged so what a Worker actually saw is auditable.
type ContextPolicy struct {
	Mode   ContextMode          `json:"mode" yaml:"mode"`
	Params *ContextPolicyParams `json:"params,omitempty" yaml:"params,omitempty"`
}

// ContextPolicyParams carries the extra configuration for the "artifacts"
// variant: the ids of upstream nodes whose output artifacts to include.
type ContextPolicyParams struct {
	Artifacts []string `json:"artifacts,omitempty" yaml:"artifacts,omitempty"`
}

package domain

// ArtifactType is the enum of artifact kinds. The typed constants for these
// values are defined in M1.2 alongside the artifact store.
type ArtifactType string

// Artifact is an immutable, content-addressed output produced by a Worker. It
// becomes an input to downstream Workers and is the basis of the Node Cache.
type Artifact struct {
	ID          string         `json:"id" yaml:"id"`
	Type        ArtifactType   `json:"type" yaml:"type"`
	ContentHash string         `json:"contentHash" yaml:"contentHash"`
	MimeType    string         `json:"mimeType" yaml:"mimeType"`
	Metadata    map[string]any `json:"metadata,omitempty" yaml:"metadata,omitempty"`
	ProducedBy  string         `json:"producedBy" yaml:"producedBy"`
}

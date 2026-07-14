package domain

// ArtifactType is the enum of artifact kinds.
type ArtifactType string

const (
	ArtifactCode       ArtifactType = "code"
	ArtifactMarkdown   ArtifactType = "markdown"
	ArtifactJSON       ArtifactType = "json"
	ArtifactDiff       ArtifactType = "diff"
	ArtifactImage      ArtifactType = "image"
	ArtifactFile       ArtifactType = "file"
	ArtifactReport     ArtifactType = "report"
	ArtifactTestResult ArtifactType = "test-result"
	ArtifactMetrics    ArtifactType = "metrics"
)

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

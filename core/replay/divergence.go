package replay

// DivergenceStatus classifies one node's relationship between an original
// execution's Timeline and a re-execution's Timeline (REQ-REPLAY-03).
type DivergenceStatus string

const (
	// Cached means the node's artifact hash is byte-identical across both
	// Timelines — the node contributed nothing new, whether or not it was
	// literally served from the node cache (REQ-CACHE-02) or happened to
	// recompute the same bytes.
	Cached DivergenceStatus = "cached"
	// ReExecuted means the node ran again and produced a different artifact.
	// This is never a claim of reproducibility: an LLM-backed node's output is
	// not guaranteed deterministic (docs/replay-honesty.md).
	ReExecuted DivergenceStatus = "re-executed"
	// Added means the node exists only in the re-execution's Timeline (e.g. a
	// node added to the workflow since the original ran).
	Added DivergenceStatus = "added"
	// Removed means the node exists only in the original's Timeline (e.g. a
	// node removed from the workflow since).
	Removed DivergenceStatus = "removed"
)

// NodeDivergence is one node's side-by-side comparison between an original
// execution and its re-execution. OriginalContent/NewContent are each
// Timeline's recorded artifact bytes for the node (empty if the node has no
// recorded artifact, e.g. it failed or was skipped) — the diff itself is left
// to the caller (CLI/UI): core does not embed a diffing library for a
// side-by-side view no requirement specifies a rendered format for.
type NodeDivergence struct {
	NodeID          string
	Status          DivergenceStatus
	OriginalHash    string
	NewHash         string
	OriginalContent []byte
	NewContent      []byte
}

// Divergence compares two Timelines of the same workflow, node by node
// (REQ-REPLAY-03): a node is Cached iff both Timelines recorded the exact
// same artifact hash, ReExecuted iff both have the node but the hash differs,
// and Added/Removed when a node is present in only one Timeline (the
// workflow itself changed between the two runs).
func Divergence(original, reexecuted Timeline) []NodeDivergence {
	seen := make(map[string]bool, len(original.Nodes))
	out := make([]NodeDivergence, 0, len(original.Nodes))

	for id, orig := range original.Nodes {
		seen[id] = true
		neu, ok := reexecuted.Nodes[id]
		if !ok {
			out = append(out, NodeDivergence{
				NodeID: id, Status: Removed,
				OriginalHash: orig.Hash, OriginalContent: orig.Content,
			})
			continue
		}
		d := NodeDivergence{
			NodeID:          id,
			OriginalHash:    orig.Hash,
			NewHash:         neu.Hash,
			OriginalContent: orig.Content,
			NewContent:      neu.Content,
		}
		if orig.Hash != "" && orig.Hash == neu.Hash {
			d.Status = Cached
		} else {
			d.Status = ReExecuted
		}
		out = append(out, d)
	}
	for id, neu := range reexecuted.Nodes {
		if seen[id] {
			continue
		}
		out = append(out, NodeDivergence{NodeID: id, Status: Added, NewHash: neu.Hash, NewContent: neu.Content})
	}
	return out
}

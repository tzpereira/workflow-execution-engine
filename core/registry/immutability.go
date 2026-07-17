package registry

import "fmt"

// ConflictError is returned when a definition is registered at a version that
// already holds *different* content (REQ-VERSION-01) — the mechanism that stops
// a "released" version from being silently mutated out from under the cache
// keys and execution snapshots that pinned it. It names both hashes so the
// caller can see exactly what changed.
type ConflictError struct {
	Kind     Kind
	Ref      string
	Existing string // content hash already registered at Ref
	Incoming string // content hash of the rejected re-registration
}

func (e *ConflictError) Error() string {
	return fmt.Sprintf(
		"registry: %s %q is already registered with content hash %s; refusing to overwrite it with different content (hash %s) — bump the version instead of mutating a released one",
		e.Kind, e.Ref, short(e.Existing), short(e.Incoming),
	)
}

// short trims a 64-hex-char content hash to a readable prefix for messages; the
// full hashes stay on the struct fields for programmatic inspection.
func short(hash string) string {
	if len(hash) > 12 {
		return hash[:12] + "…"
	}
	return hash
}

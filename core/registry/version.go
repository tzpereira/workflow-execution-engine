// Package registry is the versioned definition store (REQ-VERSION-01..03). It
// holds Workflows and Workers at immutable "id@version" coordinates: once a
// version is registered, republishing different content at that same version is
// an error, not an overwrite (REQ-VERSION-01). That immutability is what lets a
// version string act as a content-hash pin — a cache key (REQ-CACHE-01) or an
// execution snapshot (REQ-VERSION-02) can name "reviewer@1.0.0" and trust it
// means exactly one thing forever. The Registry satisfies engine.WorkerSource,
// so it drops in wherever the in-memory map stood before, without the executor
// changing.
//
// Scope note (Phase 1): a Contract has no version of its own — it is embedded
// in a Worker and versioned with it. There is no serializable Tool *definition*
// type either (tools are runtime code with a Version() method, ADR 0008), so
// "version everything" concretely means Workflow and Worker here; Contract is
// covered transitively, and tool versions are a runtime concern the cache key
// already records (cache.Inputs.ToolVersions).
package registry

import (
	"fmt"
	"regexp"
	"strings"
)

// semverRe is the official SemVer 2.0.0 grammar (semver.org), which RE2
// accepts as-is (no lookarounds or backreferences). MAJOR.MINOR.PATCH are
// required; the pre-release and build-metadata suffixes are optional. Hand-
// rolled rather than pulling a semver dependency for a surface this small
// (CONSTITUTION.md: "when the surface actually used is small, hand-roll it").
var semverRe = regexp.MustCompile(`^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$`)

// ValidVersion reports whether v is a valid semantic version (semver.org 2.0.0).
func ValidVersion(v string) bool {
	return semverRe.MatchString(v)
}

// ParseRef splits an "id@version" reference into its parts. Both must be
// non-empty and the version must be valid semver, else it returns a descriptive
// error naming the offending reference. This is the single place the "id@version"
// string form is parsed — nothing else in the codebase splits on "@".
func ParseRef(ref string) (id, version string, err error) {
	id, version, ok := strings.Cut(ref, "@")
	if !ok || id == "" || version == "" {
		return "", "", fmt.Errorf(`registry: %q is not a valid "id@version" reference`, ref)
	}
	if !ValidVersion(version) {
		return "", "", fmt.Errorf("registry: reference %q has an invalid semver version %q", ref, version)
	}
	return id, version, nil
}

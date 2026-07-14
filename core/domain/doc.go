// Package domain holds the Go structs that mirror the canonical JSON Schemas in
// schemas/. The schemas are the source of truth; these structs must stay in
// lockstep with them (enforced by core/domain/schema_drift_test.go).
//
// Every field carries identical `json` and `yaml` tags so a single in-process
// value serializes byte-for-byte the same way to both formats (see ADR 0002).
// Hashing and cache keys route through core/canonical, never through these
// structs directly (see ADR 0003).
package domain

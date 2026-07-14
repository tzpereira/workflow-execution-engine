// Package serialize converts between YAML, JSON, and the shared Go structs in
// core/domain. YAML is the canonical authoring format and JSON is the
// equivalent wire/storage form; both decode into the same structs and the
// round-trip is loss-free (see ADR 0002).
package serialize

import "gopkg.in/yaml.v3"

// MarshalYAML encodes v as YAML.
func MarshalYAML(v any) ([]byte, error) { return yaml.Marshal(v) }

// UnmarshalYAML decodes YAML into v (a pointer).
func UnmarshalYAML(data []byte, v any) error { return yaml.Unmarshal(data, v) }

// Package canonical produces the one deterministic JSON encoding that every
// hash in the project is computed over: object keys sorted lexicographically at
// every level, number precision preserved, no HTML escaping. It is the single
// function artifact ids and cache keys route through (see ADR 0003). A second,
// divergent encoder anywhere would silently break cache correctness.
package canonical

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
)

// Marshal returns the canonical JSON encoding of v.
//
// encoding/json already emits map[string]T keys in sorted order but preserves
// struct field order, so we round-trip through a generic value (all objects
// become maps) to force a total, deterministic key ordering everywhere.
func Marshal(v any) ([]byte, error) {
	raw, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}

	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber() // keep 0.01 / 1000 exactly as written, not as float64
	var generic any
	if err := dec.Decode(&generic); err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(generic); err != nil {
		return nil, err
	}
	// Encoder.Encode appends a newline; the canonical document excludes it.
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

// Hash returns the hex-encoded SHA-256 of Marshal(v) — the content identity
// used for structured values (cache keys, definition hashes).
func Hash(v any) (string, error) {
	b, err := Marshal(v)
	if err != nil {
		return "", err
	}
	return HashBytes(b), nil
}

// HashBytes returns the hex-encoded SHA-256 of raw bytes. Use it for opaque
// artifact content (code, diffs, images, …) that has no canonical JSON form;
// Hash is for structured values. Both live here so every hash in the project
// shares one implementation (see ADR 0003).
func HashBytes(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

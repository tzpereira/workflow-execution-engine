// Package security contains cross-cutting runtime safety helpers.
package security

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
)

// Finding identifies one forbidden byte sequence found on disk.
type Finding struct {
	Path  string
	Value string
}

// ScanFilesForSecrets walks root and reports files containing any forbidden
// value. Empty values are ignored. It is intentionally byte-oriented so it can
// scan JSONL events, artifacts, cache indexes, bundles, and logs alike.
func ScanFilesForSecrets(root string, forbidden []string) ([]Finding, error) {
	needles := make([][]byte, 0, len(forbidden))
	values := make([]string, 0, len(forbidden))
	for _, value := range forbidden {
		if value == "" {
			continue
		}
		needles = append(needles, []byte(value))
		values = append(values, value)
	}
	if len(needles) == 0 {
		return nil, nil
	}

	var findings []Finding
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		data, err := os.ReadFile(path)
		if err != nil {
			if errors.Is(err, fs.ErrNotExist) {
				return nil
			}
			return fmt.Errorf("security: scan %s: %w", path, err)
		}
		for i, needle := range needles {
			if bytes.Contains(data, needle) {
				findings = append(findings, Finding{Path: path, Value: values[i]})
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return findings, nil
}

// Package store is the local, content-addressed artifact store. Content is
// keyed by the SHA-256 of its bytes (see ADR 0003), so identical content is
// stored exactly once and an artifact's identity is derivable from the content
// alone — the property the Node Cache (M1.6) relies on.
package store

import (
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"

	"github.com/tzpereira/workflow-execution-engine/core/canonical"
)

// Store reads and writes artifact bytes under <baseDir>/artifacts.
type Store struct {
	dir string
}

// New returns a Store rooted at <baseDir>/artifacts. baseDir is the workspace
// root (conventionally ".workflow"). Directories are created lazily on Put.
func New(baseDir string) *Store {
	return &Store{dir: filepath.Join(baseDir, "artifacts")}
}

// Put writes content and returns its hash. Writing the same content twice is a
// no-op: the second call sees the existing file and returns without rewriting.
// Concurrent Puts of the same content converge on one file.
func (s *Store) Put(content []byte) (string, error) {
	hash := canonical.HashBytes(content)
	target := filepath.Join(s.dir, hash)

	if _, err := os.Stat(target); err == nil {
		return hash, nil // already stored; dedupe
	} else if !errors.Is(err, fs.ErrNotExist) {
		return "", fmt.Errorf("store: stat %s: %w", hash, err)
	}

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return "", fmt.Errorf("store: create dir: %w", err)
	}

	// Write to a unique temp file, then atomically rename into place so a
	// reader never sees a partial artifact and concurrent writers don't clash.
	tmp, err := os.CreateTemp(s.dir, "tmp-*")
	if err != nil {
		return "", fmt.Errorf("store: temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op after a successful rename

	if _, err := tmp.Write(content); err != nil {
		tmp.Close()
		return "", fmt.Errorf("store: write: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("store: close: %w", err)
	}
	if err := os.Rename(tmpName, target); err != nil {
		return "", fmt.Errorf("store: commit %s: %w", hash, err)
	}
	return hash, nil
}

// Get returns the content for hash, or an error if it is not stored.
func (s *Store) Get(hash string) ([]byte, error) {
	b, err := os.ReadFile(filepath.Join(s.dir, hash))
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("store: artifact %s not found", hash)
		}
		return nil, fmt.Errorf("store: read %s: %w", hash, err)
	}
	return b, nil
}

// Has reports whether an artifact with hash is stored.
func (s *Store) Has(hash string) bool {
	_, err := os.Stat(filepath.Join(s.dir, hash))
	return err == nil
}

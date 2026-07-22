// Package store is the local, content-addressed artifact store. Content is
// keyed by the SHA-256 of its bytes (see ADR 0003), so identical content is
// stored exactly once and an artifact's identity is derivable from the content
// alone — the property the Node Cache (M1.6) relies on.
package store

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	// DefaultMaxArtifactBytes bounds a single artifact. It is intentionally high
	// enough for practical diffs/reports but low enough to catch runaway tool or
	// provider output before it silently fills the workspace.
	DefaultMaxArtifactBytes int64 = 32 << 20
	// DefaultMaxTotalBytes bounds the artifact directory. Callers that need a
	// different retention envelope can use NewWithOptions.
	DefaultMaxTotalBytes int64 = 1 << 30
	limitPreviewBytes          = 1024
)

// Store reads and writes artifact bytes under <baseDir>/artifacts.
type Store struct {
	mu               sync.Mutex
	dir              string
	maxArtifactBytes int64
	maxTotalBytes    int64
}

// Option configures artifact retention limits. A value <= 0 disables that
// particular limit.
type Option func(*Store)

// WithMaxArtifactBytes sets the per-artifact byte limit.
func WithMaxArtifactBytes(n int64) Option {
	return func(s *Store) { s.maxArtifactBytes = n }
}

// WithMaxTotalBytes sets the total artifact-directory byte quota.
func WithMaxTotalBytes(n int64) Option {
	return func(s *Store) { s.maxTotalBytes = n }
}

// New returns a Store rooted at <baseDir>/artifacts. baseDir is the workspace
// root (conventionally ".workflow"). Directories are created lazily on Put.
func New(baseDir string) *Store {
	return NewWithOptions(baseDir)
}

// NewWithOptions returns a Store rooted at <baseDir>/artifacts with explicit
// quota controls.
func NewWithOptions(baseDir string, opts ...Option) *Store {
	s := &Store{
		dir:              filepath.Join(baseDir, "artifacts"),
		maxArtifactBytes: DefaultMaxArtifactBytes,
		maxTotalBytes:    DefaultMaxTotalBytes,
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// LimitError reports an artifact-size or store-quota violation with a bounded
// preview suitable for diagnostics. The full content is never written.
type LimitError struct {
	Code    string
	Limit   int64
	Actual  int64
	Summary string
}

func (e *LimitError) Error() string {
	return fmt.Sprintf("store: %s limit exceeded: %d > %d bytes; preview: %s", e.Code, e.Actual, e.Limit, e.Summary)
}

// Put writes content and returns its hash. Writing the same content twice is a
// no-op: the second call sees the existing file and returns without rewriting.
// Concurrent Puts of the same content converge on one file.
func (s *Store) Put(content []byte) (string, error) {
	return s.PutReader(bytes.NewReader(content))
}

// PutReader streams content into a temp file while hashing it and enforcing the
// single-artifact limit. It still returns the content hash, preserving
// content-addressed identity for every stored artifact.
func (s *Store) PutReader(r io.Reader) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.dir, 0o755); err != nil {
		return "", fmt.Errorf("store: create dir: %w", err)
	}
	tmp, err := os.CreateTemp(s.dir, "tmp-*")
	if err != nil {
		return "", fmt.Errorf("store: temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName) // no-op after a successful rename

	hash, n, previewBytes, err := streamToTemp(r, tmp, s.maxArtifactBytes)
	if err != nil {
		tmp.Close()
		return "", err
	}
	if s.maxArtifactBytes > 0 && n > s.maxArtifactBytes {
		tmp.Close()
		return "", &LimitError{
			Code:    "artifact_too_large",
			Limit:   s.maxArtifactBytes,
			Actual:  n,
			Summary: preview(previewBytes, limitPreviewBytes),
		}
	}

	target := filepath.Join(s.dir, hash)
	if _, err := os.Stat(target); err == nil {
		tmp.Close()
		return hash, nil // already stored; dedupe
	} else if !errors.Is(err, fs.ErrNotExist) {
		tmp.Close()
		return "", fmt.Errorf("store: stat %s: %w", hash, err)
	}

	if err := s.checkTotalQuota(hash, n); err != nil {
		tmp.Close()
		return "", err
	}
	if err := tmp.Close(); err != nil {
		return "", fmt.Errorf("store: close: %w", err)
	}
	// Atomically rename into place so a reader never sees a partial artifact.
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

// GCStats summarizes an explicit garbage-collection pass.
type GCStats struct {
	RemovedFiles int
	RemovedBytes int64
	KeptFiles    int
	KeptBytes    int64
}

// GarbageCollect removes stored artifacts not present in keep. If olderThan is
// non-zero, a candidate must also be older than that cutoff. This is deliberately
// explicit: replay/export decide what hashes are still reachable, then ask the
// store to reclaim everything else.
func (s *Store) GarbageCollect(keep map[string]bool, olderThan time.Time) (GCStats, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	var stats GCStats
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return stats, nil
		}
		return stats, fmt.Errorf("store: gc read dir: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), "tmp-") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return stats, fmt.Errorf("store: gc stat %s: %w", entry.Name(), err)
		}
		if keep[entry.Name()] || (!olderThan.IsZero() && !info.ModTime().Before(olderThan)) {
			stats.KeptFiles++
			stats.KeptBytes += info.Size()
			continue
		}
		if err := os.Remove(filepath.Join(s.dir, entry.Name())); err != nil {
			return stats, fmt.Errorf("store: gc remove %s: %w", entry.Name(), err)
		}
		stats.RemovedFiles++
		stats.RemovedBytes += info.Size()
	}
	return stats, nil
}

func (s *Store) checkTotalQuota(incomingHash string, incomingBytes int64) error {
	if s.maxTotalBytes <= 0 {
		return nil
	}
	used, err := s.totalBytes()
	if err != nil {
		return err
	}
	if used+incomingBytes <= s.maxTotalBytes {
		return nil
	}
	return &LimitError{
		Code:    "artifact_quota_exceeded",
		Limit:   s.maxTotalBytes,
		Actual:  used + incomingBytes,
		Summary: fmt.Sprintf("incoming artifact %s would add %d bytes to %d bytes already stored", incomingHash, incomingBytes, used),
	}
}

func (s *Store) totalBytes() (int64, error) {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return 0, nil
		}
		return 0, fmt.Errorf("store: quota read dir: %w", err)
	}
	var total int64
	for _, entry := range entries {
		if entry.IsDir() || strings.HasPrefix(entry.Name(), "tmp-") {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			return 0, fmt.Errorf("store: quota stat %s: %w", entry.Name(), err)
		}
		total += info.Size()
	}
	return total, nil
}

func preview(content []byte, max int) string {
	if len(content) == 0 {
		return ""
	}
	if len(content) > max {
		content = content[:max]
	}
	s := strings.TrimSpace(string(content))
	fields := strings.Fields(s)
	if len(fields) == 0 {
		return "<binary or whitespace>"
	}
	if len(s) > 300 {
		return s[:300] + "..."
	}
	return s
}

func streamToTemp(r io.Reader, tmp *os.File, max int64) (string, int64, []byte, error) {
	hasher := sha256.New()
	var preview bytes.Buffer
	var total int64
	buf := make([]byte, 32*1024)
	for {
		n, readErr := r.Read(buf)
		if n > 0 {
			chunk := buf[:n]
			total += int64(n)
			if _, err := hasher.Write(chunk); err != nil {
				return "", total, preview.Bytes(), fmt.Errorf("store: hash: %w", err)
			}
			if preview.Len() < limitPreviewBytes {
				remaining := limitPreviewBytes - preview.Len()
				if remaining > len(chunk) {
					remaining = len(chunk)
				}
				_, _ = preview.Write(chunk[:remaining])
			}
			if max <= 0 || total <= max {
				if _, err := tmp.Write(chunk); err != nil {
					return "", total, preview.Bytes(), fmt.Errorf("store: write: %w", err)
				}
			}
			if max > 0 && total > max {
				return hex.EncodeToString(hasher.Sum(nil)), total, preview.Bytes(), nil
			}
		}
		if readErr == io.EOF {
			return hex.EncodeToString(hasher.Sum(nil)), total, preview.Bytes(), nil
		}
		if readErr != nil {
			return "", total, preview.Bytes(), fmt.Errorf("store: read artifact stream: %w", readErr)
		}
	}
}

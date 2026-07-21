// Package settings persists the durable, non-secret configuration of a local
// wee serve control plane (M2.2, REQ-CTRL-05): provider references and base
// URLs, the default budget, cache mode, workspace root, and template paths. It
// lives in the workspace as settings.json (ADR 0012 — in-workspace, no OS
// config dir) and is written crash-safe (temp file + rename, NFR-CTRL-01) so an
// ill-timed kill never leaves a truncated file.
//
// It never holds a secret value. Provider keys stay env/keychain references
// (PRIN-10): ProviderKeyEnv records the *name* of the environment variable a
// provider's key comes from, never the key itself. Nothing in the Settings
// struct can carry key material by construction.
package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sync"
)

const settingsFile = "settings.json"

// Settings is the persisted, non-secret control-plane configuration. Every
// field is omitempty so a never-configured service serializes to "{}", and an
// old file gains new fields as zero values without a migration.
type Settings struct {
	// ProviderBaseURLs maps a provider name ("openai", "anthropic") to the API
	// root a run should target, so a self-hosted OpenAI-compatible endpoint
	// (Ollama, vLLM, llama.cpp) survives a restart without re-flagging
	// (REQ-MODEL-04).
	ProviderBaseURLs map[string]string `json:"providerBaseUrls,omitempty"`
	// ProviderKeyEnv maps a provider name to the environment variable NAME that
	// holds its API key — never the value (PRIN-10). It lets the Settings panel
	// remember which env var each provider reads across restarts and show its
	// presence, without a secret ever being written to disk.
	ProviderKeyEnv map[string]string `json:"providerKeyEnv,omitempty"`
	// DefaultBudgetUSD is the max cost applied to a run that does not override it.
	DefaultBudgetUSD float64 `json:"defaultBudgetUsd,omitempty"`
	// CacheMode is the default cache mode ("on"|"off"|"readonly") for started runs.
	CacheMode string `json:"cacheMode,omitempty"`
	// WorkspaceRoot is the tool sandbox / working-directory root remembered for
	// the service.
	WorkspaceRoot string `json:"workspaceRoot,omitempty"`
	// TemplatePaths are directories of `wee export` bundles the gallery lists.
	TemplatePaths []string `json:"templatePaths,omitempty"`
}

// Store reads and writes a workspace's settings.json. Safe for concurrent use.
type Store struct {
	path string
	mu   sync.Mutex
}

// New returns a Store over <baseDir>/settings.json. baseDir is the workspace
// state directory (the same root core/store, core/eventlog, and core/cache use).
func New(baseDir string) *Store {
	return &Store{path: filepath.Join(baseDir, settingsFile)}
}

// Load reads the persisted settings. A missing file is the zero Settings, not an
// error — a service that has never been configured starts blank.
func (s *Store) Load() (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, err := os.ReadFile(s.path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return Settings{}, nil
		}
		return Settings{}, fmt.Errorf("settings: read %s: %w", s.path, err)
	}
	var v Settings
	if err := json.Unmarshal(data, &v); err != nil {
		return Settings{}, fmt.Errorf("settings: decode %s: %w", s.path, err)
	}
	return v, nil
}

// Save persists v atomically: a temp file in the same directory, then rename, so
// a crash mid-write leaves the previous settings intact (NFR-CTRL-01). It never
// writes secret values — the Settings type has no field that can hold one.
func (s *Store) Save(v Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("settings: create dir: %w", err)
	}
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return fmt.Errorf("settings: encode: %w", err)
	}
	tmp, err := os.CreateTemp(dir, settingsFile+".*.tmp")
	if err != nil {
		return fmt.Errorf("settings: temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("settings: write: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("settings: close: %w", err)
	}
	if err := os.Rename(tmpName, s.path); err != nil {
		return fmt.Errorf("settings: commit: %w", err)
	}
	return nil
}

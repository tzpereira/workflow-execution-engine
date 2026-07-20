package runner

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadConfigResolvesWorkspaceRootBesideConfigFile(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "wee.yaml"), []byte("workspaceRoot: target\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := loadConfig(dir)
	if err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(dir, "target")
	if cfg.WorkspaceRoot != want {
		t.Fatalf("WorkspaceRoot = %q, want %q", cfg.WorkspaceRoot, want)
	}
}

func TestLoadConfigExpandsWorkspaceRootEnvironment(t *testing.T) {
	dir := t.TempDir()
	root := t.TempDir()
	t.Setenv("WEE_TEST_WORKSPACE_ROOT", root)
	if err := os.WriteFile(filepath.Join(dir, "wee.yaml"), []byte("workspaceRoot: $WEE_TEST_WORKSPACE_ROOT\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := loadConfig(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.WorkspaceRoot != root {
		t.Fatalf("WorkspaceRoot = %q, want %q", cfg.WorkspaceRoot, root)
	}
}

func TestLoadConfigSupportsWorkspaceRootEnvironmentDefault(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "wee.yaml"), []byte("workspaceRoot: ${WEE_TEST_OPTIONAL_ROOT:-.}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := loadConfig(dir)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.WorkspaceRoot != filepath.Join(dir, ".") {
		t.Fatalf("WorkspaceRoot = %q, want default relative to config dir", cfg.WorkspaceRoot)
	}
}

func TestLoadConfigRejectsUnsetWorkspaceRootEnvironment(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "wee.yaml"), []byte("workspaceRoot: ${WEE_TEST_MISSING_ROOT}\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := loadConfig(dir)
	if err == nil {
		t.Fatal("loadConfig succeeded with an unset workspaceRoot env var")
	}
	if got := err.Error(); got != `workspaceRoot: environment variable "WEE_TEST_MISSING_ROOT" is not set` {
		t.Fatalf("error = %q", got)
	}
}

func TestLoadConfigWithoutFileKeepsCurrentDirectoryDefault(t *testing.T) {
	cfg, err := loadConfig(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	if cfg.WorkspaceRoot != "." {
		t.Fatalf("WorkspaceRoot = %q, want current-directory default", cfg.WorkspaceRoot)
	}
}

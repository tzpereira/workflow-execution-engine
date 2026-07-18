package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// chdir switches to dir for the duration of a test, restoring the old cwd after.
func chdir(t *testing.T, dir string) {
	t.Helper()
	old, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(dir); err != nil {
		t.Fatalf("chdir %s: %v", dir, err)
	}
	t.Cleanup(func() { _ = os.Chdir(old) })
}

// TestInitScaffoldsRunnableExample is the setup half of REQ-CLI-02: init lays
// down the .workflow/ dir and an examples/ pair, and the scaffolded workflow
// passes validation — so the very next `wee run` has something valid to run.
func TestInitScaffoldsRunnableExample(t *testing.T) {
	chdir(t, t.TempDir())

	if _, err := execCLI(t, "init"); err != nil {
		t.Fatalf("init: %v", err)
	}

	for _, p := range []string{workspaceDir, filepath.Join("examples", "hello.yaml"), filepath.Join("examples", "greeter.worker.yaml")} {
		if _, err := os.Stat(p); err != nil {
			t.Errorf("init did not create %s: %v", p, err)
		}
	}

	// The scaffolded workflow must validate — the whole point of a zero-config
	// first run is that it works without editing.
	if _, err := execCLI(t, "validate", filepath.Join("examples", "hello.yaml")); err != nil {
		t.Errorf("scaffolded hello.yaml failed validation: %v", err)
	}
}

// TestInitNeverOverwrites: a second init leaves an edited example untouched.
func TestInitNeverOverwrites(t *testing.T) {
	chdir(t, t.TempDir())
	if _, err := execCLI(t, "init"); err != nil {
		t.Fatalf("first init: %v", err)
	}

	hello := filepath.Join("examples", "hello.yaml")
	if err := os.WriteFile(hello, []byte("id: edited\n"), 0o644); err != nil {
		t.Fatalf("edit hello: %v", err)
	}

	out, err := execCLI(t, "init")
	if err != nil {
		t.Fatalf("second init: %v", err)
	}
	if !strings.Contains(out, "skipped") {
		t.Errorf("expected a 'skipped' notice on re-init, got: %q", out)
	}
	data, _ := os.ReadFile(hello)
	if string(data) != "id: edited\n" {
		t.Errorf("init overwrote an edited file: %q", string(data))
	}
}

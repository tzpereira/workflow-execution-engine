package cmd

import (
	"archive/tar"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBackupCreateRestoreRoundTrip(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	dst := filepath.Join(dir, "dst")
	writeStateFile(t, filepath.Join(src, "executions", "e1", "events.jsonl"), "event\n")
	writeStateFile(t, filepath.Join(src, "cache", "index.json"), "{}\n")
	archive := filepath.Join(dir, "backup.tar.gz")

	if out, err := execCLI(t, "backup", "--workspace", src, "create", archive); err != nil {
		t.Fatalf("backup create: %v", err)
	} else if !strings.Contains(out, "backup created") {
		t.Fatalf("backup create output = %q", out)
	}
	if out, err := execCLI(t, "backup", "--workspace", dst, "restore", archive); err != nil {
		t.Fatalf("backup restore: %v", err)
	} else if !strings.Contains(out, "backup restored") {
		t.Fatalf("backup restore output = %q", out)
	}
	data, err := os.ReadFile(filepath.Join(dst, "executions", "e1", "events.jsonl"))
	if err != nil || string(data) != "event\n" {
		t.Fatalf("restored events = %q err=%v", data, err)
	}
}

func TestBackupRestoreRefusesNonEmptyWithoutForce(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src")
	dst := filepath.Join(dir, "dst")
	writeStateFile(t, filepath.Join(src, "settings.json"), "{}\n")
	writeStateFile(t, filepath.Join(dst, "existing"), "keep\n")
	archive := filepath.Join(dir, "backup.tar.gz")
	if _, err := execCLI(t, "backup", "--workspace", src, "create", archive); err != nil {
		t.Fatalf("backup create: %v", err)
	}
	if _, err := execCLI(t, "backup", "--workspace", dst, "restore", archive); err == nil {
		t.Fatal("restore should require --force for a non-empty workspace")
	}
	if _, err := execCLI(t, "backup", "--workspace", dst, "restore", "--force", archive); err != nil {
		t.Fatalf("restore --force: %v", err)
	}
}

func TestBackupRestoreRejectsUnsafeEntry(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(dir, "bad.tar.gz")
	f, err := os.Create(archive)
	if err != nil {
		t.Fatal(err)
	}
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	if err := tw.WriteHeader(&tar.Header{Name: "../escape", Mode: 0o644, Size: int64(len("x"))}); err != nil {
		t.Fatal(err)
	}
	if _, err := tw.Write([]byte("x")); err != nil {
		t.Fatal(err)
	}
	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := execCLI(t, "backup", "--workspace", filepath.Join(dir, "dst"), "restore", archive); err == nil {
		t.Fatal("restore accepted a path traversal entry")
	}
}

func writeStateFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", filepath.Dir(path), err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

package cmd

import (
	"os/exec"
	"path/filepath"
	"testing"
	"time"
)

// TestStartupUnder50ms verifies NFR-CLI-01: `wee --help` completes in under
// 50ms. It builds the real binary and measures the best of several runs (the
// first invocation pays a one-time OS page-cache cost that isn't startup work).
// Skipped in -short mode, since it compiles the binary.
func TestStartupUnder50ms(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping startup benchmark in -short mode (it builds the binary)")
	}

	bin := filepath.Join(t.TempDir(), "wee")
	build := exec.Command("go", "build", "-o", bin, "..")
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build wee: %v\n%s", err, out)
	}

	// Warm up: the first exec pays dyld/page-cache costs unrelated to startup.
	_ = exec.Command(bin, "--help").Run()

	best := time.Hour
	for i := 0; i < 7; i++ {
		start := time.Now()
		if err := exec.Command(bin, "--help").Run(); err != nil {
			t.Fatalf("run --help: %v", err)
		}
		if d := time.Since(start); d < best {
			best = d
		}
	}
	if best > 50*time.Millisecond {
		t.Errorf("wee --help best-of-7 took %v, want < 50ms (NFR-CLI-01)", best)
	}
	t.Logf("wee --help startup (best of 7): %v", best)
}

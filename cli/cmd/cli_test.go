package cmd

import (
	"strings"
	"testing"
)

func TestCLICommandRunsZeroConfigExperience(t *testing.T) {
	out, err := execCLI(t, "cli")
	if err != nil {
		t.Fatalf("wee cli: %v\n%s", err, out)
	}
	for _, want := range []string{
		"wee cli",
		"Zero-config CLI smoke run",
		"cli-smoke@1.0.0",
		"succeeded",
		"stdout: cli-ok",
		"Temporary workspace removed",
	} {
		if !strings.Contains(out, want) {
			t.Fatalf("wee cli output missing %q:\n%s", want, out)
		}
	}
}

func TestCLICommandRegistered(t *testing.T) {
	root := newRootCmd()
	for _, c := range root.Commands() {
		if c.Name() == "cli" {
			return
		}
	}
	t.Fatal("cli command is not registered on root")
}

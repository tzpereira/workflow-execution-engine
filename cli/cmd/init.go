package cmd

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
)

// workspaceDir is the per-workspace state directory the engine writes
// executions, artifacts, and the cache index under (store/eventlog/cache all
// root here). ".workflow" is the convention across the docs and core packages.
const workspaceDir = ".workflow"

// helloWorkflow and greeterWorker are the zero-config first-run pair (REQ-CLI-02):
// `wee init && wee run examples/hello.yaml` runs with only OPENAI_API_KEY set.
// The worker file sits next to the workflow so `wee run`'s worker loader (same
// directory, *.worker.yaml) resolves greeter@1.0.0.
const helloWorkflow = `# The smallest runnable workflow: one Worker, no tools, no inputs.
# Run it with:  wee run examples/hello.yaml   (needs OPENAI_API_KEY)
id: hello
version: 1.0.0
nodes:
  - id: greet
    worker: greeter@1.0.0
edges: []
budget:
  maxCostUsd: 0.05
  maxTokens: 500
  maxDurationMs: 30000
  maxRetriesPerNode: 1
`

const greeterWorker = `# The Worker greet@1.0.0 references. A tight output contract (one bounded
# string) keeps the model on task — see examples/pr-review for a richer one.
id: greeter
version: 1.0.0
objective: Greet the user warmly in one short sentence.
constraints:
  - Keep it to a single friendly sentence.
tools: []
contextPolicy:
  mode: none
contract:
  goal: Produce a short, friendly greeting.
  rules:
    - One sentence, warm and concise.
  successCriteria:
    - The greeting is a single sentence.
  maxRetries: 1
  outputSchema:
    type: object
    additionalProperties: false
    required: [greeting]
    properties:
      greeting:
        type: string
        maxLength: 200
model:
  provider: openai
  model: gpt-4o-mini
  params:
    temperature: 0
`

// newInitCmd implements `wee init` (REQ-CLI-01): scaffold the workspace state
// directory and a minimal, runnable example so a first run needs zero config
// beyond a provider key (REQ-CLI-02).
func newInitCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "init",
		Short: "Scaffold a workspace with a minimal, runnable example workflow",
		Long: "Init creates the .workflow/ state directory and an examples/ folder with a\n" +
			"minimal hello workflow and its Worker. After running it,\n" +
			"`wee run examples/hello.yaml` works with only OPENAI_API_KEY set. Existing\n" +
			"files are never overwritten.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, args []string) error {
			return runInit(cmd)
		},
	}
}

func runInit(cmd *cobra.Command) error {
	out := cmd.OutOrStdout()

	if err := os.MkdirAll(workspaceDir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", workspaceDir, err)
	}
	fmt.Fprintf(out, "created %s/\n", workspaceDir)

	if err := os.MkdirAll("examples", 0o755); err != nil {
		return fmt.Errorf("create examples/: %w", err)
	}

	files := []struct{ path, content string }{
		{filepath.Join("examples", "hello.yaml"), helloWorkflow},
		{filepath.Join("examples", "greeter.worker.yaml"), greeterWorker},
	}
	for _, f := range files {
		wrote, err := writeIfAbsent(f.path, f.content)
		if err != nil {
			return err
		}
		if wrote {
			fmt.Fprintf(out, "created %s\n", f.path)
		} else {
			fmt.Fprintf(out, "exists, skipped %s\n", f.path)
		}
	}

	fmt.Fprint(out, "\nNext: set OPENAI_API_KEY, then run\n  wee run examples/hello.yaml\n")
	return nil
}

// writeIfAbsent writes content to path only if it does not already exist,
// reporting whether it wrote. It never overwrites — init is safe to re-run.
func writeIfAbsent(path, content string) (wrote bool, err error) {
	if _, err := os.Stat(path); err == nil {
		return false, nil // already there; leave it
	} else if !os.IsNotExist(err) {
		return false, fmt.Errorf("stat %s: %w", path, err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return false, fmt.Errorf("write %s: %w", path, err)
	}
	return true, nil
}

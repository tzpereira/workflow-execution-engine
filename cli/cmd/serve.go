package cmd

import (
	"context"
	"fmt"
	"path/filepath"

	"github.com/spf13/cobra"

	"github.com/tzpereira/workflow-execution-engine/cli/internal/runner"
	"github.com/tzpereira/workflow-execution-engine/core/engine"
	"github.com/tzpereira/workflow-execution-engine/core/server"
)

// newServeCmd implements `wee serve` (REQ-CLI-01 command surface, REQ-UI-02).
// It exposes the workspace's event log over HTTP, upgrading to WebSocket for
// the live stream (ADR 0010, github.com/coder/websocket) so the UI can watch a
// run live — the same event schema `wee run --json` emits, never a second
// source of truth (PRIN-02). The server also starts runs on request (POST
// /api/run), resolving the workflow path under --dir with the exact same
// assembly `wee run` uses.
func newServeCmd() *cobra.Command {
	var addr, workspace, dir, cache string
	cmd := &cobra.Command{
		Use:   "serve",
		Short: "Serve the live execution event stream (WebSocket) for the UI",
		Long: "Serve exposes the workspace over HTTP for the visual UI:\n" +
			"  GET  /api/executions            list recorded and in-flight runs\n" +
			"  GET  /api/executions/{id}       a run's full recorded events (audit)\n" +
			"  GET  /api/executions/{id}/events  live event stream (WebSocket)\n" +
			"  POST /api/run                   start a run ({\"workflow\":\"<path under --dir>\"})\n\n" +
			"Each frame is byte-identical to one line of `wee run --json` and is pushed,\n" +
			"not polled (ADR 0010). The UI is a pure client of it.",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			cacheMode, err := parseCacheMode(cache)
			if err != nil {
				return coded(ExitValidation, err)
			}
			srv := server.New(workspace, runStarter(dir, workspace, cacheMode))
			out := cmd.OutOrStdout()
			fmt.Fprintf(out, "wee serve listening on http://%s\n", addr)
			fmt.Fprintf(out, "  workspace: %s   workflows under: %s\n", workspace, dir)
			fmt.Fprintf(out, "  stream:    GET http://%s/api/executions/{id}/events\n", addr)
			return srv.ListenAndServe(addr)
		},
	}
	fl := cmd.Flags()
	fl.StringVar(&addr, "addr", "127.0.0.1:7676", "host:port to listen on")
	fl.StringVar(&workspace, "workspace", workspaceDir, "workspace state directory")
	fl.StringVar(&dir, "dir", ".", "base directory that POST /api/run workflow paths resolve against")
	fl.StringVar(&cache, "cache", "on", "cache mode for started runs: on | off | readonly")
	return cmd
}

// runStarter returns the server's StartFunc: it resolves ref as a workflow file
// under dir, assembles the engine exactly as `wee run` does, and launches the
// execution in the background. The run uses context.Background() — NOT the HTTP
// request's context, which ends the moment POST /api/run returns — so the run
// outlives the request and the client watches it over the WebSocket stream.
func runStarter(dir, workspace string, cache engine.CacheMode) server.StartFunc {
	return func(ref string) (string, error) {
		path := filepath.Join(dir, ref)
		asm, err := runner.Load(path, workspace)
		if err != nil {
			return "", err
		}
		if err := validateWorkflowFile(asm.Workflow, path); err != nil {
			return "", err
		}
		execID := runner.NewExecutionID(asm.Workflow.ID)
		opts := engine.RunOptions{
			ExecutionID:      execID,
			Budget:           asm.Workflow.Budget,
			Cache:            cache,
			DefinitionHashes: asm.Registry.DefinitionHashes(*asm.Workflow),
			Workers:          asm.Registry.Workers(*asm.Workflow),
		}
		go func() { _, _ = asm.Scheduler.Run(context.Background(), asm.Workflow, opts) }()
		return execID, nil
	}
}

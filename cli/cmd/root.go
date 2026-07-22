// Package cmd defines the wee CLI's cobra command tree. Each command wraps one
// core package; this file owns the root command, process exit codes, and the
// Main entrypoint.
package cmd

import (
	"errors"
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// Exit codes (REQ-CLI-04). A command signals a specific code by returning a
// *CodedError; anything else is a generic failure (1).
const (
	ExitOK          = 0
	ExitNodeFailure = 1
	ExitBudget      = 2
	ExitValidation  = 3
	ExitCancelled   = 130
)

// CodedError attaches a process exit code to an error so Main can translate a
// command's failure into the exit code REQ-CLI-04 specifies, without every
// command touching os.Exit itself.
type CodedError struct {
	Code int
	Err  error
}

func (e *CodedError) Error() string { return e.Err.Error() }
func (e *CodedError) Unwrap() error { return e.Err }

// coded wraps err with an exit code (nil stays nil, so callers can `return
// coded(code, doThing())` unconditionally).
func coded(code int, err error) error {
	if err == nil {
		return nil
	}
	return &CodedError{Code: code, Err: err}
}

// newRootCmd builds the command tree. Subcommands are added here as they are
// implemented.
func newRootCmd() *cobra.Command {
	root := &cobra.Command{
		Use:   "wee",
		Short: "Workflow execution engine — run engineering processes as versioned, auditable software",
		Long: "wee runs, replays, and inspects workflow executions.\n\n" +
			"A workflow is a versioned graph of Workers (LLM roles) and Tools (deterministic\n" +
			"actions). Every run is recorded to an append-only, hash-chained event log, so an\n" +
			"execution can be audited or replayed exactly as it happened.",
		SilenceUsage:  true, // a failed command shouldn't dump usage; the error is enough
		SilenceErrors: true, // Main prints the error with the right prefix and exit code
	}
	root.AddCommand(newValidateCmd())
	root.AddCommand(newCLICmd())
	root.AddCommand(newInitCmd())
	root.AddCommand(newRunCmd())
	root.AddCommand(newReplayCmd())
	root.AddCommand(newInspectCmd())
	root.AddCommand(newExportCmd())
	root.AddCommand(newCacheCmd())
	root.AddCommand(newBackupCmd())
	root.AddCommand(newListCmd())
	root.AddCommand(newServeCmd())
	return root
}

// Main executes the CLI and exits the process with the code REQ-CLI-04 defines.
func Main() {
	os.Exit(exitCode(newRootCmd().Execute()))
}

// exitCode prints a failure to stderr and maps it to a process exit code. A
// *CodedError carries its own; any other error is a generic failure (1).
func exitCode(err error) int {
	if err == nil {
		return ExitOK
	}
	fmt.Fprintln(os.Stderr, "wee: "+err.Error())
	var ce *CodedError
	if errors.As(err, &ce) {
		return ce.Code
	}
	return ExitNodeFailure
}

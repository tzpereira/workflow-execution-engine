package cmd

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/tzpereira/workflow-execution-engine/core/serialize"
	"github.com/tzpereira/workflow-execution-engine/core/validate"
)

// newValidateCmd implements `wee validate <workflow.yaml>` (REQ-CLI-01),
// wrapping core/validate: schema validation then graph validation, with source
// line numbers on every problem.
func newValidateCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "validate <workflow.yaml>",
		Short: "Validate a workflow definition against the schema and graph rules",
		Long: "Validate checks a workflow file two ways: against the JSON Schema (shape,\n" +
			"required fields, exactly-one-of worker/tool per node), then against the graph\n" +
			"rules (no cycles, every edge resolves). Problems are reported with source line\n" +
			"numbers. Exits 3 if the workflow is invalid.",
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			return runValidate(cmd, args[0])
		},
	}
}

func runValidate(cmd *cobra.Command, path string) error {
	wf, err := serialize.LoadWorkflow(path)
	if err != nil {
		// A load failure (missing file, malformed YAML) is a validation-class
		// error too — the file didn't pass the first gate.
		return coded(ExitValidation, err)
	}

	// Source lets validation problems carry the line they occur on. It is
	// best-effort: if it can't be built, validation still runs, just without
	// line numbers.
	src, _ := serialize.LoadSource(path)

	v, err := validate.NewValidator()
	if err != nil {
		return fmt.Errorf("build validator: %w", err)
	}
	if err := v.Validate(validate.KindWorkflow, wf, src); err != nil {
		return coded(ExitValidation, err)
	}
	if err := validate.Graph(wf, src); err != nil {
		return coded(ExitValidation, err)
	}

	fmt.Fprintf(cmd.OutOrStdout(), "%s: valid (%s@%s, %d node(s))\n", path, wf.ID, wf.Version, len(wf.Nodes))
	return nil
}

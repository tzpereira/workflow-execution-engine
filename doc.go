// Package wee is the root anchor for the Workflow Execution Engine module.
//
// It intentionally contains no logic. The engine lives in subpackages under
// core/, the command-line interface in cli/, and the Go authoring SDK in sdk/
// (see docs/EXECUTION.md for the milestone-by-milestone layout). This file
// exists so the module builds and tests cleanly from the first milestone,
// before any of those packages are written.
package wee

// Package validate checks domain objects two ways: against their JSON Schema
// (schema.go) and, for a Workflow, against graph rules (graph.go). Both produce
// human-readable, positional errors — file:line when a source resolver is
// supplied (see core/serialize.Source).
package validate

import (
	"fmt"
	"strings"
)

// LineResolver maps a JSON pointer (e.g. "/edges/2/to") to a 1-based source
// line. *serialize.Source satisfies it. Pass nil when no positions are known.
type LineResolver interface {
	Line(pointer string) (int, bool)
	File() string
}

// Problem is a single validation failure located by JSON pointer and, where
// derivable, by source line.
type Problem struct {
	Pointer string // JSON pointer to the offending value ("" = document root)
	Line    int    // 1-based source line, 0 if unknown
	Message string
}

func (p Problem) String() string {
	loc := p.Pointer
	if loc == "" {
		loc = "/"
	}
	if p.Line > 0 {
		return fmt.Sprintf("%s (line %d): %s", loc, p.Line, p.Message)
	}
	return fmt.Sprintf("%s: %s", loc, p.Message)
}

// resolveLine fills a Problem's Line from src when available.
func resolveLine(src LineResolver, p Problem) Problem {
	if src != nil {
		if ln, ok := src.Line(p.Pointer); ok {
			p.Line = ln
		}
	}
	return p
}

// formatProblems renders a header, an optional file name, and the problem list.
func formatProblems(header string, src LineResolver, problems []Problem) string {
	var b strings.Builder
	b.WriteString(header)
	if src != nil && src.File() != "" {
		fmt.Fprintf(&b, " in %s", src.File())
	}
	b.WriteString(":")
	for _, p := range problems {
		fmt.Fprintf(&b, "\n  - %s", p.String())
	}
	return b.String()
}

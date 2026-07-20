package engine

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"
)

// placeholderRe matches a leaf value that is, in its entirety, a "${...}"
// placeholder — never an embedded/concatenated occurrence within a larger
// string (ADR 0008: deliberately minimal, no mini template engine). A
// workflow needing a composed multi-field string pushes that composition
// into a Worker's Contract output instead, and references that one field.
var placeholderRe = regexp.MustCompile(`^\$\{(.+)\}$`)

// resolveToolInput walks a ToolCall's Input tree, replacing whole-string
// placeholders with resolved values (REQ-WORKER-06). It recurses into maps
// and arrays; a leaf value that isn't a string (number, bool, null) is never
// a placeholder candidate and passes through unchanged.
//
// secrets accumulates resolved env values, keyed by the resolved value
// itself, mapping to the literal placeholder string that produced it — the
// caller uses this to redact those values out of anything it later emits or
// returns (see redactBytes/redactString). refHashes accumulates the content
// hash of every upstream NodeInput an artifact placeholder actually
// referenced, for NodeResult.ContextHashes — the same audit property
// REQ-CTXPOL-03 gives model-backed nodes, extended here at no extra cost.
func resolveToolInput(v any, inputs []NodeInput, wfInputs map[string]string, secrets map[string]string, refHashes map[string]bool) (any, error) {
	switch val := v.(type) {
	case string:
		return resolvePlaceholder(val, inputs, wfInputs, secrets, refHashes)
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, sub := range val {
			r, err := resolveToolInput(sub, inputs, wfInputs, secrets, refHashes)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", k, err)
			}
			out[k] = r
		}
		return out, nil
	case []any:
		out := make([]any, len(val))
		for i, sub := range val {
			r, err := resolveToolInput(sub, inputs, wfInputs, secrets, refHashes)
			if err != nil {
				return nil, fmt.Errorf("[%d]: %w", i, err)
			}
			out[i] = r
		}
		return out, nil
	default:
		return val, nil
	}
}

// resolvePlaceholder resolves one string leaf. A string not matching the
// whole-string placeholder pattern is literal and returned unchanged.
//
// "${env:NAME}" resolves from the OS environment at call time — never from
// the workflow definition — matching how provider API keys are already read
// (core/model/openai, core/model/anthropic): only the variable NAME ever
// appears in a definition, never a value (NFR-SEC-01).
// "${env:NAME:-}" makes that reference optional and resolves to an empty
// string when NAME is unset. This is useful for optional HTTP authorization:
// the HTTP tool omits empty-valued headers entirely.
//
// "${input:NAME}" resolves against wfInputs — the run's resolved
// Workflow.Inputs values (REQ-INPUT-01), supplied by the caller or defaulted.
// Unlike "${env:NAME}" this is not a secret and is not redacted: the whole
// point is that an audit trail can show what a run actually ran against.
//
// "${nodeID.path}" resolves against the upstream NodeInput whose FromNode is
// nodeID, via the existing dotted-path walker (lookupPath, conditional.go —
// same package, no new parsing). An empty path (no ".", e.g. "${diff}")
// returns that node's entire parsed output, per lookupPath's own contract.
func resolvePlaceholder(s string, inputs []NodeInput, wfInputs map[string]string, secrets map[string]string, refHashes map[string]bool) (any, error) {
	m := placeholderRe.FindStringSubmatch(s)
	if m == nil {
		return s, nil
	}
	inner := m[1]

	if name, ok := strings.CutPrefix(inner, "env:"); ok {
		fallback := ""
		optional := false
		if envName, envFallback, found := strings.Cut(name, ":-"); found {
			name, fallback, optional = envName, envFallback, true
		}
		val, ok := os.LookupEnv(name)
		if !ok {
			if optional {
				return fallback, nil
			}
			return nil, fmt.Errorf("placeholder %q: environment variable %q is not set", s, name)
		}
		if val != "" {
			secrets[val] = s
		}
		return val, nil
	}

	if name, ok := strings.CutPrefix(inner, "input:"); ok {
		val, ok := wfInputs[name]
		if !ok {
			return nil, fmt.Errorf("placeholder %q: workflow input %q has no value (not declared, or not supplied)", s, name)
		}
		return val, nil
	}

	nodeID, path, _ := strings.Cut(inner, ".")
	for _, in := range inputs {
		if in.FromNode != nodeID {
			continue
		}
		var doc any
		if err := json.Unmarshal(in.Content, &doc); err != nil {
			return nil, fmt.Errorf("placeholder %q: upstream artifact from %q is not valid JSON: %w", s, nodeID, err)
		}
		got, found := lookupPath(doc, path)
		if !found {
			return nil, fmt.Errorf("placeholder %q: path %q not found in %q's output", s, path, nodeID)
		}
		if refHashes != nil {
			refHashes[in.Hash] = true
		}
		return got, nil
	}
	return nil, fmt.Errorf("placeholder %q: no upstream input from node %q (not wired by an edge?)", s, nodeID)
}

// redactBytes replaces every occurrence of a resolved secret value with the
// placeholder string that produced it, over raw bytes destined for an event
// payload. Narrowly scoped to this new code path — the general M2.0
// redaction pass is separate, deferred scope.
func redactBytes(b []byte, secrets map[string]string) []byte {
	for val, ref := range secrets {
		if val == "" {
			continue
		}
		b = bytes.ReplaceAll(b, []byte(val), []byte(ref))
	}
	return b
}

// redactString is the same substitution over plain text (error strings).
func redactString(s string, secrets map[string]string) string {
	for val, ref := range secrets {
		if val == "" {
			continue
		}
		s = strings.ReplaceAll(s, val, ref)
	}
	return s
}

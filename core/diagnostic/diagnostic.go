// Package diagnostic carries structured, user-facing failure metadata across
// runtime boundaries without adding event types. Callers can still use ordinary
// Go wrapping and errors.Is/As; the metadata is an overlay for CLI/UI rendering.
package diagnostic

import (
	"errors"
	"fmt"
	"time"
)

// Kind is the high-level subsystem that produced a failure.
type Kind string

const (
	KindEngine       Kind = "engine"
	KindTool         Kind = "tool"
	KindProvider     Kind = "provider"
	KindValidation   Kind = "validation"
	KindBudget       Kind = "budget"
	KindCache        Kind = "cache"
	KindArtifact     Kind = "artifact"
	KindCancellation Kind = "cancellation"
	KindTimeout      Kind = "timeout"
)

// Diagnostic is an error wrapper with stable machine fields and concise
// human-facing guidance. Cause remains unwrap-able.
type Diagnostic struct {
	Kind       Kind
	Code       string
	NodeID     string
	Operation  string
	Message    string
	LikelyFix  string
	RetryAfter time.Duration
	Cause      error
}

func (d *Diagnostic) Error() string {
	msg := d.Message
	if msg == "" && d.Cause != nil {
		msg = d.Cause.Error()
	} else if msg != "" && d.Cause != nil {
		msg += ": " + d.Cause.Error()
	}
	if d.NodeID != "" {
		msg = fmt.Sprintf("node %q: %s", d.NodeID, msg)
	}
	if d.LikelyFix != "" {
		msg += "; likely fix: " + d.LikelyFix
	}
	return msg
}

func (d *Diagnostic) Unwrap() error { return d.Cause }

// Wrap attaches diagnostic metadata to err. A nil err stays nil.
func Wrap(err error, kind Kind, code, nodeID, operation, message, likelyFix string) error {
	if err == nil {
		return nil
	}
	return &Diagnostic{
		Kind:      kind,
		Code:      code,
		NodeID:    nodeID,
		Operation: operation,
		Message:   message,
		LikelyFix: likelyFix,
		Cause:     err,
	}
}

// WithRetryAfter preserves a provider/server retry hint on an existing
// Diagnostic wrapper.
func WithRetryAfter(err error, d time.Duration) error {
	var diag *Diagnostic
	if errors.As(err, &diag) {
		diag.RetryAfter = d
	}
	return err
}

// From returns the first Diagnostic in err's chain.
func From(err error) (*Diagnostic, bool) {
	var d *Diagnostic
	if errors.As(err, &d) {
		return d, true
	}
	return nil, false
}

// Payload renders a stable JSON-friendly event payload fragment.
func Payload(err error, fallbackNode string) map[string]any {
	d, ok := From(err)
	if !ok {
		return map[string]any{
			"kind":    string(KindEngine),
			"code":    "runtime_error",
			"nodeId":  fallbackNode,
			"message": errString(err),
		}
	}
	nodeID := d.NodeID
	if nodeID == "" {
		nodeID = fallbackNode
	}
	out := map[string]any{
		"kind":      string(d.Kind),
		"code":      d.Code,
		"nodeId":    nodeID,
		"operation": d.Operation,
		"message":   d.Message,
		"likelyFix": d.LikelyFix,
	}
	if d.RetryAfter > 0 {
		out["retryAfterMs"] = d.RetryAfter.Milliseconds()
	}
	return out
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

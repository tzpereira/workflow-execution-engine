// Package model is the provider-agnostic seam between the engine and real model
// APIs. The engine calls exactly one method — Provider.Complete — and never sees
// a vendor request/response type or an HTTP concern: those live entirely in the
// per-provider sub-packages (model/openai, model/anthropic), each a hand-rolled
// net/http client (ADR 0006). Swapping or adding a provider never touches the
// engine (REQ-MODEL-01).
package model

import (
	"context"
	"fmt"
	"time"
)

// Role is a message author. The three roles are all providers need; the engine
// builds messages only in core/contract (the one place message text is
// constructed).
type Role string

const (
	RoleSystem    Role = "system"
	RoleUser      Role = "user"
	RoleAssistant Role = "assistant"
)

// Message is one turn of model input. It carries no vendor shape — each provider
// maps it onto its own wire format.
type Message struct {
	Role    Role
	Content string
}

// Params are the model-call parameters, provider-agnostic. Model is the model
// identifier; Extra passes through Worker-declared knobs (temperature, max
// tokens, …) opaquely — providers read what they understand and ignore the rest.
type Params struct {
	Model string
	Extra map[string]any
}

// Response is a completed model call: the full output text plus token usage for
// cost accounting (REQ-BUDGET-03). No streaming — outputs are validated whole
// against contract schemas (ADR 0006).
type Response struct {
	Content      string
	InputTokens  int64
	OutputTokens int64
}

// Provider is the single interface the engine invokes models through
// (REQ-MODEL-01). Implementations must classify failures with TransientError /
// FatalError so core/engine owns retry policy (REQ-MODEL-05); they never
// implement their own retry loops.
type Provider interface {
	Complete(ctx context.Context, messages []Message, params Params) (Response, error)
}

// TransientError marks a retryable provider failure (HTTP 429, 5xx, timeout).
// RetryAfter, when present, carries the server's requested delay (from a
// Retry-After header) as a floor for the engine's backoff — the engine still
// owns the loop (REQ-MODEL-05).
type TransientError struct {
	Err        error
	RetryAfter time.Duration
	HasRetry   bool
}

func (e *TransientError) Error() string { return e.Err.Error() }
func (e *TransientError) Unwrap() error { return e.Err }

// RetryAfterHint reports a server-requested delay, if any. The engine reads it
// through an anonymous interface so its retry loop never imports this package
// (REQ-MODEL-05).
func (e *TransientError) RetryAfterHint() (time.Duration, bool) { return e.RetryAfter, e.HasRetry }

// FatalError marks a non-retryable provider failure (4xx other than 429, or a
// malformed response). The engine fails the node without retrying.
type FatalError struct {
	Err error
}

func (e *FatalError) Error() string { return e.Err.Error() }
func (e *FatalError) Unwrap() error { return e.Err }

// Registry maps a Worker's provider name to its implementation (REQ-MODEL-01).
// It is populated once at startup and read concurrently thereafter.
type Registry struct {
	providers map[string]Provider
}

// NewRegistry returns an empty registry.
func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

// Register adds (or replaces) the provider under name.
func (r *Registry) Register(name string, p Provider) {
	r.providers[name] = p
}

// Get returns the provider registered under name. An empty name selects the
// default provider, "openai" (cheaper — ADR 0006, REQ-MODEL-02).
func (r *Registry) Get(name string) (Provider, error) {
	if name == "" {
		name = DefaultProvider
	}
	p, ok := r.providers[name]
	if !ok {
		return nil, fmt.Errorf("model: no provider registered as %q", name)
	}
	return p, nil
}

// DefaultProvider is the provider a Worker gets when it declares none.
const DefaultProvider = "openai"

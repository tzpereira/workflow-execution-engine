package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/tool"
)

// ToolExecutor is the deterministic, tool-backed NodeExecutor (ADR 0008,
// REQ-WORKER-05): it resolves a node's ToolCall against the tool registry and
// invokes it via tool.Invoke — no model ever selects or shapes a tool call's
// input (ADR 0006). It implements ToolEmitter, not CacheKeyer: its
// ToolCalled/ToolResult events reach the real execution log through the
// scheduler's per-call emit closure, and tool-backed nodes are never cached
// (REQ-WORKER-07) — a Tool is opaque to the engine, which cannot verify its
// Execute doesn't read ambient state.
//
// Every error ToolExecutor returns is Fatal: no REQ asks for tool-call retry
// classification (unlike REQ-MODEL-05's model-specific transient/fatal split),
// and inventing transient-error heuristics for git/http/terminal here would
// be undelivered scope. This is a disclosed v1 simplification, not an
// oversight.
type ToolExecutor struct {
	tools *tool.Registry
	now   func() time.Time
}

// NewToolExecutor builds a ToolExecutor over the given tool registry.
func NewToolExecutor(tools *tool.Registry) *ToolExecutor {
	return &ToolExecutor{tools: tools, now: time.Now}
}

var (
	_ NodeExecutor = (*ToolExecutor)(nil)
	_ ToolEmitter  = (*ToolExecutor)(nil)
)

// Execute implements NodeExecutor for callers that don't need the emit
// bridge (e.g. direct unit tests). The scheduler always calls
// ExecuteWithEmit (node.go's ToolEmitter type assertion).
func (e *ToolExecutor) Execute(ctx context.Context, req NodeRequest) (NodeResult, error) {
	return e.execute(ctx, req, func(domain.EventType, map[string]any) {})
}

// ExecuteWithEmit implements ToolEmitter.
func (e *ToolExecutor) ExecuteWithEmit(ctx context.Context, req NodeRequest, emit func(domain.EventType, map[string]any)) (NodeResult, error) {
	return e.execute(ctx, req, emit)
}

func (e *ToolExecutor) execute(ctx context.Context, req NodeRequest, emit func(domain.EventType, map[string]any)) (NodeResult, error) {
	call := req.Node.Tool
	if call == nil {
		return NodeResult{}, Fatal(fmt.Errorf("engine: node %q is not tool-backed", req.Node.ID))
	}
	t, ok := e.tools.Get(call.ToolName)
	if !ok {
		return NodeResult{}, Fatal(fmt.Errorf("engine: node %q: no tool registered as %q", req.Node.ID, call.ToolName))
	}

	secrets := make(map[string]string)
	refHashes := make(map[string]bool)
	resolved, err := resolveToolInput(call.Input, req.Inputs, secrets, refHashes)
	if err != nil {
		return NodeResult{}, Fatal(fmt.Errorf("engine: node %q: resolving tool input: %w", req.Node.ID, err))
	}
	inputBytes, err := json.Marshal(resolved)
	if err != nil {
		return NodeResult{}, Fatal(fmt.Errorf("engine: node %q: encoding tool input: %w", req.Node.ID, err))
	}

	// Every event tool.Invoke emits is redacted before it reaches the real
	// log — this is the fix that keeps a resolved ${env:...} secret out of
	// persisted events (NFR-SEC-01); see redactPayload's doc comment.
	out, invokeErr := tool.Invoke(ctx, t, inputBytes, func(evType domain.EventType, payload map[string]any) {
		emit(evType, redactPayload(payload, secrets))
	}, e.now)
	if invokeErr != nil {
		// The error path is outside the emit bridge — Scheduler.executeNode
		// logs err.Error() directly on Failure — so it must be redacted here
		// too, not just at the event-payload level above.
		return NodeResult{}, Fatal(fmt.Errorf("%s", redactString(invokeErr.Error(), secrets)))
	}

	// The resulting artifact itself is a third leak vector, not just events
	// and errors: a tool's real output can legitimately echo back what it was
	// given — e.g. terminal's `curl -v` prints the request headers it sent to
	// stderr; an http response can mirror request data in some APIs' error
	// bodies. The artifact is content-addressed and stored verbatim
	// (core/store), so it gets the same redaction before the engine ever
	// writes it.
	out = redactBytes(out, secrets)

	artifactType := domain.ArtifactJSON
	if at, ok := t.(interface{ ArtifactType() domain.ArtifactType }); ok {
		artifactType = at.ArtifactType()
	}

	hashes := make([]string, 0, len(refHashes))
	for h := range refHashes {
		hashes = append(hashes, h)
	}

	return NodeResult{
		Content:       out,
		Type:          artifactType,
		MimeType:      "application/json",
		ContextHashes: hashes,
	}, nil
}

// redactPayload substitutes any resolved secret value in an event payload
// with the placeholder string that produced it, targeting the specific keys
// tool.Invoke's ToolCalled/ToolResult payloads use (core/tool/tool.go):
// "input"/"output" (json.RawMessage) and "error" (string). Coupled to that
// exact shape on purpose — this is a narrow fix for this new code path, not
// the general M2.0 redaction pass across the whole engine.
func redactPayload(payload map[string]any, secrets map[string]string) map[string]any {
	if len(secrets) == 0 {
		return payload
	}
	out := make(map[string]any, len(payload))
	for k, v := range payload {
		switch k {
		case "input", "output":
			if raw, ok := v.(json.RawMessage); ok {
				out[k] = json.RawMessage(redactBytes(raw, secrets))
				continue
			}
		case "error":
			if s, ok := v.(string); ok {
				out[k] = redactString(s, secrets)
				continue
			}
		}
		out[k] = v
	}
	return out
}

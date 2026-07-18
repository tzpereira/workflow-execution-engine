package render

import (
	"fmt"
	"io"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/engine"
)

// humanRenderer prints a readable, incremental line per meaningful event. This
// is the plain (non-styled) renderer; the live lipgloss rendering builds on the
// same event set. It tracks a running cost so Finish can print a summary even
// when the terminal state came mid-stream.
type humanRenderer struct {
	w     io.Writer
	cost  float64
	toks  int64
}

// Human returns a Renderer that writes readable status lines to w.
func Human(w io.Writer) Renderer {
	return &humanRenderer{w: w}
}

func (r *humanRenderer) Event(ev domain.Event) {
	switch ev.Type {
	case domain.ExecutionStarted:
		fmt.Fprintf(r.w, "▶ %s@%s\n", str(ev.Payload["workflow"]), str(ev.Payload["version"]))
	case domain.WorkerStarted:
		fmt.Fprintf(r.w, "  · %s\n", ev.NodeID)
	case domain.CacheHit:
		fmt.Fprintf(r.w, "  ⤿ %s  cache hit (saved $%.4f)\n", ev.NodeID, num(ev.Payload["savedCostUsd"]))
	case domain.ToolCalled:
		fmt.Fprintf(r.w, "  ⚙ %s  tool call\n", ev.NodeID)
	case domain.Retry:
		fmt.Fprintf(r.w, "  ↻ %s  retry (%s)\n", ev.NodeID, str(ev.Payload["reason"]))
	case domain.WorkerFinished:
		c, tk := num(ev.Payload["costUsd"]), int64(num(ev.Payload["tokens"]))
		r.cost += c
		r.toks += tk
		fmt.Fprintf(r.w, "  ✓ %s  ($%.4f, %d tok)\n", ev.NodeID, c, tk)
	case domain.ContractViolation:
		fmt.Fprintf(r.w, "  ⚠ %s  contract violation\n", ev.NodeID)
	case domain.Failure:
		fmt.Fprintf(r.w, "  ✗ %s  %s\n", ev.NodeID, str(ev.Payload["error"]))
	case domain.BudgetWarning:
		fmt.Fprintf(r.w, "  ! budget warning\n")
	case domain.BudgetExceeded:
		fmt.Fprintf(r.w, "  ! budget exceeded\n")
	case domain.Cancelled:
		fmt.Fprintf(r.w, "  ⏹ cancelled\n")
	}
}

func (r *humanRenderer) Finish(res *engine.Result) {
	if res == nil {
		return
	}
	fmt.Fprintf(r.w, "\n%s — %d node(s), $%.4f, %d tokens\n",
		res.State, len(res.Nodes), res.SpentCostUSD, res.SpentTokens)
}

// str/num coerce a payload value (decoded from JSON, so numbers are float64)
// without panicking on a missing or unexpected key.
func str(v any) string {
	s, _ := v.(string)
	return s
}

func num(v any) float64 {
	switch n := v.(type) {
	case float64:
		return n
	case int64:
		return float64(n)
	case int:
		return float64(n)
	}
	return 0
}

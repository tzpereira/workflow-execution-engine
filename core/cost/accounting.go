// Package cost turns a completed model call's token usage into a dollar figure
// using each provider's published per-token rates (REQ-BUDGET-03). The engine
// feeds the result into the budget tracker so limits are enforced against real
// spend (REQ-BUDGET-01), and rolls it up per node and per execution.
//
// An unknown (provider, model) pair costs $0 — deliberately, so self-hosted
// OpenAI-compatible endpoints (Ollama, vLLM) are free by default (REQ-MODEL-04)
// rather than mis-priced. Rates are a static table; keeping them in one place
// makes them auditable and easy to update.
package cost

// rate is the USD cost per single token, split by direction.
type rate struct {
	inputPerToken  float64
	outputPerToken float64
}

// perMillion builds a rate from the conventional "USD per 1,000,000 tokens"
// figures providers publish.
func perMillion(inUSD, outUSD float64) rate {
	return rate{inputPerToken: inUSD / 1_000_000, outputPerToken: outUSD / 1_000_000}
}

// rates is the published-price table, keyed by provider then model. Prices are
// list prices in USD per 1M tokens (input, output); update here as vendors
// change them. Unlisted models fall through to $0 (see package doc).
var rates = map[string]map[string]rate{
	"openai": {
		"gpt-4o":       perMillion(2.50, 10.00),
		"gpt-4o-mini":  perMillion(0.15, 0.60),
		"gpt-4.1":      perMillion(2.00, 8.00),
		"gpt-4.1-mini": perMillion(0.40, 1.60),
		"o4-mini":      perMillion(1.10, 4.40),
	},
	"anthropic": {
		"claude-3-5-sonnet": perMillion(3.00, 15.00),
		"claude-3-5-haiku":  perMillion(0.80, 4.00),
		"claude-3-opus":     perMillion(15.00, 75.00),
		"claude-sonnet-5":   perMillion(3.00, 15.00),
	},
}

// Compute returns the USD cost of a call given the provider, model, and token
// counts. An empty provider resolves to the default ("openai"); an unknown
// provider or model yields $0.
func Compute(provider, model string, inputTokens, outputTokens int64) float64 {
	if provider == "" {
		provider = "openai"
	}
	byModel, ok := rates[provider]
	if !ok {
		return 0
	}
	r, ok := byModel[model]
	if !ok {
		return 0
	}
	return float64(inputTokens)*r.inputPerToken + float64(outputTokens)*r.outputPerToken
}

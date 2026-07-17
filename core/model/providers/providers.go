// Package providers is the single wiring site that binds the built-in provider
// implementations into a model.Registry. It is deliberately the ONLY package —
// outside the provider packages themselves — permitted to import
// core/model/openai and core/model/anthropic; everything else, the engine
// included, depends only on the model.Provider interface (REQ-MODEL-01,
// enforced by core/model's isolation test). Keeping the binding here also breaks
// the import cycle that a binding inside core/model would create.
package providers

import (
	"github.com/tzpereira/workflow-execution-engine/core/model"
	"github.com/tzpereira/workflow-execution-engine/core/model/anthropic"
	"github.com/tzpereira/workflow-execution-engine/core/model/openai"
)

// Default returns a Registry wired with the built-in providers, each reading its
// own API key from the environment: "openai" (the default, cheaper) and
// "anthropic". To target a self-hosted OpenAI-compatible endpoint (Ollama, vLLM,
// llama.cpp), register openai.New(openai.WithBaseURL(...)) under a name of your
// choosing (REQ-MODEL-04).
func Default() *model.Registry {
	r := model.NewRegistry()
	r.Register("openai", openai.New())
	r.Register("anthropic", anthropic.New())
	return r
}

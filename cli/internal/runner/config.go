package runner

import (
	"os"
	"path/filepath"

	"github.com/tzpereira/workflow-execution-engine/core/cache"
	"github.com/tzpereira/workflow-execution-engine/core/serialize"
)

// config is the optional wee.yaml a workflow directory may carry to configure
// tool sandboxing. Everything is optional; an absent file yields safe,
// deny-first defaults (empty allowlists, workspace root = current directory).
//
//	# wee.yaml
//	workspaceRoot: .
//	terminal:
//	  allow: [go, git]
//	  timeoutMs: 30000
//	http:
//	  allow: [api.github.com]
type config struct {
	WorkspaceRoot string `yaml:"workspaceRoot"`
	Terminal      struct {
		Allow     []string `yaml:"allow"`
		TimeoutMs int64    `yaml:"timeoutMs"`
	} `yaml:"terminal"`
	HTTP struct {
		Allow []string `yaml:"allow"`
	} `yaml:"http"`
}

// loadConfig reads wee.yaml from dir if present. A missing file is not an error
// — it returns the defaults. WorkspaceRoot defaults to "." (the current
// directory), so filesystem/terminal/git operate where the user invoked wee.
func loadConfig(dir string) (*config, error) {
	var c config
	data, err := os.ReadFile(filepath.Join(dir, "wee.yaml"))
	switch {
	case err == nil:
		if err := serialize.UnmarshalYAML(data, &c); err != nil {
			return nil, err
		}
	case os.IsNotExist(err):
		// keep defaults
	default:
		return nil, err
	}
	if c.WorkspaceRoot == "" {
		c.WorkspaceRoot = "."
	}
	return &c, nil
}

// cacheFor builds the node cache rooted at baseDir.
func cacheFor(baseDir string) *cache.Cache {
	return cache.New(baseDir)
}

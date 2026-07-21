// Package http is a Tool making GET/POST requests, gated by a per-workflow
// domain allowlist (REQ-TOOL-03, PRIN-10). A request to a host not on the list
// fails with a distinct error before any connection is attempted. The allowlist
// is matched on host (optionally with a leading-dot suffix for subdomains); an
// empty allowlist denies everything.
package http

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/tzpereira/workflow-execution-engine/core/tool"
)

// Tool performs allowlisted HTTP requests.
type Tool struct {
	allow  []string
	client *http.Client
}

// New builds an HTTP tool. allow is the set of permitted hosts; an entry like
// "example.com" matches that host exactly, ".example.com" matches any subdomain.
// client is injectable for tests; nil → a client with a 30s timeout.
func New(allow []string, client *http.Client) *Tool {
	if client == nil {
		client = &http.Client{Timeout: 30 * time.Second}
	}
	return &Tool{allow: allow, client: client}
}

var _ tool.Tool = (*Tool)(nil)

func (t *Tool) Name() string    { return "http" }
func (t *Tool) Version() string { return "1.0.0" }

func (t *Tool) InputSchema() []byte {
	return []byte(`{
  "type": "object",
  "additionalProperties": false,
  "required": ["method", "url"],
  "properties": {
    "method": { "enum": ["GET", "POST"] },
    "url": { "type": "string" },
    "urlRewrite": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["match", "replace"],
        "properties": {
          "match": { "type": "string" },
          "replace": { "type": "string" }
        }
      }
    },
    "failOnStatus": { "type": "boolean" },
    "headers": { "type": "object", "additionalProperties": { "type": "string" } },
    "body": { "type": "string" }
  }
}`)
}

func (t *Tool) OutputSchema() []byte {
	return []byte(`{
  "type": "object",
  "additionalProperties": false,
  "required": ["status", "body"],
  "properties": {
    "status": { "type": "integer" },
    "body": { "type": "string" }
  }
}`)
}

type request struct {
	Method       string            `json:"method"`
	URL          string            `json:"url"`
	Rewrite      []rewriteRule     `json:"urlRewrite"`
	FailOnStatus bool              `json:"failOnStatus"`
	Headers      map[string]string `json:"headers"`
	Body         string            `json:"body"`
}

type rewriteRule struct {
	Match   string `json:"match"`
	Replace string `json:"replace"`
}

// Execute checks the allowlist, then makes the request. A disallowed host fails
// before any connection.
func (t *Tool) Execute(ctx context.Context, input json.RawMessage) (json.RawMessage, error) {
	var req request
	if err := json.Unmarshal(input, &req); err != nil {
		return nil, fmt.Errorf("http: decode input: %w", err)
	}

	requestURL, err := rewriteURL(req.URL, req.Rewrite)
	if err != nil {
		return nil, err
	}

	u, err := url.Parse(requestURL)
	if err != nil {
		return nil, fmt.Errorf("http: parse url: %w", err)
	}
	if !t.allowed(u.Hostname()) {
		return nil, fmt.Errorf("http: host %q is not on the workflow domain allowlist; add it under http.allow in the workflow directory's wee.yaml", u.Hostname())
	}

	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = strings.NewReader(req.Body)
	}
	httpReq, err := http.NewRequestWithContext(ctx, req.Method, requestURL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("http: build request: %w", err)
	}
	for k, v := range req.Headers {
		if v == "" {
			continue
		}
		httpReq.Header.Set(k, v)
	}

	resp, err := t.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("http: request failed: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if req.FailOnStatus && (resp.StatusCode < 200 || resp.StatusCode >= 300) {
		return nil, fmt.Errorf("http: request returned status %d for %s: %s", resp.StatusCode, displayURL(u), previewBody(body))
	}
	out, err := json.Marshal(map[string]any{"status": resp.StatusCode, "body": string(body)})
	if err != nil {
		return nil, fmt.Errorf("http: encode output: %w", err)
	}
	return out, nil
}

func rewriteURL(raw string, rules []rewriteRule) (string, error) {
	if len(rules) == 0 {
		return raw, nil
	}
	for _, rule := range rules {
		re, err := regexp.Compile(rule.Match)
		if err != nil {
			return "", fmt.Errorf("http: compile urlRewrite match %q: %w", rule.Match, err)
		}
		if re.MatchString(raw) {
			return re.ReplaceAllString(raw, rule.Replace), nil
		}
	}
	return "", fmt.Errorf("http: url %q did not match any urlRewrite rule", raw)
}

func displayURL(u *url.URL) string {
	clone := *u
	clone.RawQuery = ""
	clone.User = nil
	return clone.String()
}

func previewBody(body []byte) string {
	s := strings.TrimSpace(string(body))
	if len(s) > 300 {
		return s[:300] + "..."
	}
	return s
}

// allowed reports whether host is permitted. An exact entry matches the host; an
// entry beginning with "." matches that suffix (any subdomain). An empty
// allowlist denies everything (deny-first, PRIN-10).
func (t *Tool) allowed(host string) bool {
	host = strings.ToLower(host)
	for _, a := range t.allow {
		a = strings.ToLower(a)
		if strings.HasPrefix(a, ".") {
			if host == a[1:] || strings.HasSuffix(host, a) {
				return true
			}
			continue
		}
		if host == a {
			return true
		}
	}
	return false
}

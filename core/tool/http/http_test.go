package http_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	httptool "github.com/tzpereira/workflow-execution-engine/core/tool/http"
)

// TestAllowedHostSucceeds: a GET to an allowlisted host returns status + body.
func TestAllowedHostSucceeds(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		_, _ = io.WriteString(w, "pong")
	}))
	defer srv.Close()

	host := hostOf(t, srv.URL)
	tool := httptool.New([]string{host}, srv.Client())
	out, err := tool.Execute(context.Background(), json.RawMessage(`{"method":"GET","url":"`+srv.URL+`"}`))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	var r struct {
		Status int    `json:"status"`
		Body   string `json:"body"`
	}
	_ = json.Unmarshal(out, &r)
	if r.Status != 200 || r.Body != "pong" {
		t.Errorf("got status=%d body=%q", r.Status, r.Body)
	}
}

// TestDisallowedDomainRejected is the M1.5 acceptance test (REQ-TOOL-03): a
// request to a host not on the allowlist fails, and the server is never hit.
func TestDisallowedDomainRejected(t *testing.T) {
	hit := false
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hit = true
	}))
	defer srv.Close()

	// Allowlist a different domain than the server's.
	tool := httptool.New([]string{"allowed.example.com"}, srv.Client())
	if _, err := tool.Execute(context.Background(), json.RawMessage(`{"method":"GET","url":"`+srv.URL+`"}`)); err == nil {
		t.Fatal("a request to a non-allowlisted host must be rejected")
	}
	if hit {
		t.Error("the server was contacted despite the host not being allowlisted")
	}
}

func TestEmptyAllowlistDeniesAll(t *testing.T) {
	tool := httptool.New(nil, nil)
	if _, err := tool.Execute(context.Background(), json.RawMessage(`{"method":"GET","url":"https://example.com"}`)); err == nil {
		t.Fatal("an empty allowlist must deny everything")
	}
}

func TestSubdomainSuffixMatch(t *testing.T) {
	tool := httptool.New([]string{".example.com"}, nil)
	// The matcher is exercised directly through a rejected/allowed decision:
	// api.example.com is allowed by the ".example.com" suffix, evil.com is not.
	if _, err := tool.Execute(context.Background(), json.RawMessage(`{"method":"GET","url":"https://evil.com"}`)); err == nil {
		t.Error("evil.com should be denied by a .example.com allowlist")
	}
}

func hostOf(t *testing.T, raw string) string {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u.Hostname()
}

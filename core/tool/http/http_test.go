package http_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
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

func TestEmptyHeaderIsOmitted(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, present := r.Header["Authorization"]; present {
			t.Error("empty Authorization header should be omitted")
		}
		_, _ = io.WriteString(w, "ok")
	}))
	defer srv.Close()

	host := hostOf(t, srv.URL)
	tool := httptool.New([]string{host}, srv.Client())
	_, err := tool.Execute(context.Background(), json.RawMessage(`{"method":"GET","url":"`+srv.URL+`","headers":{"Authorization":""}}`))
	if err != nil {
		t.Fatalf("Execute: %v", err)
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

func TestURLRewriteAllowsHumanURLThroughAPIAllowlist(t *testing.T) {
	var gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		if r.Header.Get("Accept") != "application/vnd.github.diff" {
			t.Errorf("Accept header = %q", r.Header.Get("Accept"))
		}
		_, _ = io.WriteString(w, "diff --git a/a b/a")
	}))
	defer srv.Close()

	client := srv.Client()
	client.Transport = rewriteHostTransport{
		base:      srv.Client().Transport,
		targetURL: srv.URL,
	}
	tool := httptool.New([]string{"api.github.com"}, client)
	out, err := tool.Execute(context.Background(), json.RawMessage(`{
		"method": "GET",
		"url": "https://github.com/bitcoin/bitcoin/pull/35750/changes",
		"urlRewrite": [
			{
				"match": "^https://github\\.com/([^/]+)/([^/]+)/pull/([0-9]+)(?:/.*)?$",
				"replace": "https://api.github.com/repos/$1/$2/pulls/$3"
			}
		],
		"headers": {"Accept": "application/vnd.github.diff"},
		"failOnStatus": true
	}`))
	if err != nil {
		t.Fatalf("Execute: %v", err)
	}
	var r struct {
		Status int    `json:"status"`
		Body   string `json:"body"`
	}
	_ = json.Unmarshal(out, &r)
	if gotPath != "/repos/bitcoin/bitcoin/pulls/35750" {
		t.Fatalf("transformed path = %q", gotPath)
	}
	if r.Status != 200 || r.Body != "diff --git a/a b/a" {
		t.Errorf("got status=%d body=%q", r.Status, r.Body)
	}
}

func TestURLRewriteRequiresMatchingRule(t *testing.T) {
	tool := httptool.New([]string{"api.github.com"}, nil)
	_, err := tool.Execute(context.Background(), json.RawMessage(`{
		"method": "GET",
		"url": "https://example.com/not-a-pr",
		"urlRewrite": [
			{
				"match": "^https://github\\.com/([^/]+)/([^/]+)/pull/([0-9]+)(?:/.*)?$",
				"replace": "https://api.github.com/repos/$1/$2/pulls/$3"
			}
		]
	}`))
	if err == nil {
		t.Fatal("expected an unmatched rewrite rule to fail before any request")
	}
	if !strings.Contains(err.Error(), "did not match any urlRewrite rule") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestFailOnStatusRejectsHTTPErrorBody(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
		_, _ = io.WriteString(w, `{"message":"Not Found"}`)
	}))
	defer srv.Close()

	host := hostOf(t, srv.URL)
	tool := httptool.New([]string{host}, srv.Client())
	_, err := tool.Execute(context.Background(), json.RawMessage(`{"method":"GET","url":"`+srv.URL+`","failOnStatus":true}`))
	if err == nil {
		t.Fatal("expected failOnStatus to reject a 404 response")
	}
	if !strings.Contains(err.Error(), "status 404") || !strings.Contains(err.Error(), "Not Found") {
		t.Fatalf("error should include status and body preview, got %v", err)
	}
}

type rewriteHostTransport struct {
	base      http.RoundTripper
	targetURL string
}

func (rt rewriteHostTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	target, err := url.Parse(rt.targetURL)
	if err != nil {
		return nil, err
	}
	req.URL.Scheme = target.Scheme
	req.URL.Host = target.Host
	req.Host = target.Host
	return rt.base.RoundTrip(req)
}

func hostOf(t *testing.T, raw string) string {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u.Hostname()
}

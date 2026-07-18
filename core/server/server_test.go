package server

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/eventlog"
)

// writeSnapshot seeds a minimal snapshot so Append can chain the first event to
// it (Append reads the snapshot hash as the chain root).
func seed(t *testing.T, log *eventlog.Log, id string) {
	t.Helper()
	if err := log.WriteSnapshot(id, map[string]any{"id": id}); err != nil {
		t.Fatalf("seed snapshot: %v", err)
	}
}

func appendEvent(t *testing.T, log *eventlog.Log, id string, typ domain.EventType, node string, payload map[string]any) {
	t.Helper()
	if err := log.Append(id, domain.Event{Type: typ, ExecutionID: id, NodeID: node, Payload: payload}); err != nil {
		t.Fatalf("append %s: %v", typ, err)
	}
}

// fastServer builds a Server over a temp workspace with a short poll so live
// tests don't wait 40ms per tick.
func fastServer(t *testing.T, start StartFunc) (*Server, *eventlog.Log) {
	t.Helper()
	ws := t.TempDir()
	s := New(ws, start)
	s.poll = 2 * time.Millisecond
	return s, eventlog.New(ws)
}

func TestEventsReplaysThenClosesOnTerminal(t *testing.T) {
	s, log := fastServer(t, nil)
	const id = "wf-20260718T000000-aaaa"
	seed(t, log, id)
	// A complete run recorded before the client connects: the stream must
	// replay all of it and then close on ExecutionFinished.
	appendEvent(t, log, id, domain.ExecutionStarted, "", map[string]any{"workflow": "wf", "version": "1.0.0"})
	appendEvent(t, log, id, domain.WorkerStarted, "a", nil)
	appendEvent(t, log, id, domain.WorkerFinished, "a", map[string]any{"costUsd": 0.01, "tokens": 5})
	appendEvent(t, log, id, domain.ExecutionFinished, "", map[string]any{"state": "succeeded"})

	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	events := readSSE(t, ts.URL+"/api/executions/"+id+"/events", 2*time.Second)
	if len(events) != 4 {
		t.Fatalf("want 4 events, got %d: %+v", len(events), events)
	}
	if events[0].Type != domain.ExecutionStarted || events[3].Type != domain.ExecutionFinished {
		t.Fatalf("unexpected order: %s ... %s", events[0].Type, events[3].Type)
	}
}

func TestEventsTailsLiveEventsAppendedAfterConnect(t *testing.T) {
	s, log := fastServer(t, nil)
	const id = "wf-20260718T000001-bbbb"
	seed(t, log, id)
	appendEvent(t, log, id, domain.ExecutionStarted, "", map[string]any{"workflow": "wf", "version": "1.0.0"})

	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	// Connect while the run is still "in flight", then append the rest.
	got := make(chan []domain.Event, 1)
	go func() { got <- readSSE(t, ts.URL+"/api/executions/"+id+"/events", 2*time.Second) }()

	time.Sleep(20 * time.Millisecond) // let the stream open and drain the first event
	appendEvent(t, log, id, domain.WorkerStarted, "a", nil)
	appendEvent(t, log, id, domain.ArtifactCreated, "a", map[string]any{"hash": "deadbeef", "type": "json"})
	appendEvent(t, log, id, domain.ExecutionFinished, "", map[string]any{"state": "succeeded"})

	select {
	case events := <-got:
		if len(events) != 4 {
			t.Fatalf("want 4 events (1 replayed + 3 live), got %d", len(events))
		}
		if events[len(events)-1].Type != domain.ExecutionFinished {
			t.Fatalf("stream did not close on terminal event")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("live stream never terminated")
	}
}

func TestListAndAudit(t *testing.T) {
	s, log := fastServer(t, nil)
	const done = "wf-20260718T000002-cccc"
	const live = "wf-20260718T000003-dddd"
	seed(t, log, done)
	appendEvent(t, log, done, domain.ExecutionStarted, "", map[string]any{"workflow": "wf", "version": "2.0.0"})
	appendEvent(t, log, done, domain.ExecutionFinished, "", map[string]any{"state": "succeeded"})
	seed(t, log, live)
	appendEvent(t, log, live, domain.ExecutionStarted, "", map[string]any{"workflow": "wf", "version": "2.0.0"})

	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	var list []ExecutionSummary
	getJSON(t, ts.URL+"/api/executions", &list)
	if len(list) != 2 {
		t.Fatalf("want 2 executions, got %d", len(list))
	}
	states := map[string]string{}
	for _, e := range list {
		states[e.ID] = e.State
	}
	if states[done] != "succeeded" {
		t.Errorf("finished run state = %q, want succeeded", states[done])
	}
	if states[live] != "running" {
		t.Errorf("in-flight run state = %q, want running", states[live])
	}

	var audit Audit
	getJSON(t, ts.URL+"/api/executions/"+done, &audit)
	if audit.Version != "2.0.0" || len(audit.Events) != 2 {
		t.Fatalf("audit mismatch: version=%q events=%d", audit.Version, len(audit.Events))
	}
}

func TestRunInvokesStartFuncAndReturnsID(t *testing.T) {
	var mu sync.Mutex
	var gotRef string
	start := func(ref string) (string, error) {
		mu.Lock()
		gotRef = ref
		mu.Unlock()
		return "exec-123", nil
	}
	s, _ := fastServer(t, start)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()

	body := strings.NewReader(`{"workflow":"examples/hello.yaml"}`)
	resp, err := http.Post(ts.URL+"/api/run", "application/json", body)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var out runResponse
	json.NewDecoder(resp.Body).Decode(&out)
	if out.ExecutionID != "exec-123" {
		t.Errorf("executionId = %q", out.ExecutionID)
	}
	mu.Lock()
	defer mu.Unlock()
	if gotRef != "examples/hello.yaml" {
		t.Errorf("start got ref %q", gotRef)
	}
}

func TestRunDisabledWithoutStartFunc(t *testing.T) {
	s, _ := fastServer(t, nil)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	resp, err := http.Post(ts.URL+"/api/run", "application/json", strings.NewReader(`{"workflow":"x"}`))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotImplemented {
		t.Fatalf("status = %d, want 501", resp.StatusCode)
	}
}

func TestCORSPreflight(t *testing.T) {
	s, _ := fastServer(t, nil)
	ts := httptest.NewServer(s.Handler())
	defer ts.Close()
	req, _ := http.NewRequest(http.MethodOptions, ts.URL+"/api/run", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("preflight status = %d", resp.StatusCode)
	}
	if resp.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Error("missing CORS allow-origin")
	}
}

// readSSE connects to an SSE endpoint and collects domain.Events from `data:`
// lines until the connection closes (the server closes on ExecutionFinished) or
// the deadline hits.
func readSSE(t *testing.T, url string, deadline time.Duration) []domain.Event {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), deadline)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("connect SSE: %v", err)
	}
	defer resp.Body.Close()
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "text/event-stream") {
		t.Fatalf("content-type = %q, want text/event-stream", ct)
	}

	var events []domain.Event
	sc := bufio.NewScanner(resp.Body)
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	for sc.Scan() {
		line := bytes.TrimSpace(sc.Bytes())
		if !bytes.HasPrefix(line, []byte("data: ")) {
			continue
		}
		var ev domain.Event
		if err := json.Unmarshal(bytes.TrimPrefix(line, []byte("data: ")), &ev); err != nil {
			t.Fatalf("bad SSE frame %q: %v", line, err)
		}
		events = append(events, ev)
	}
	return events
}

func getJSON(t *testing.T, url string, dst any) {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		t.Fatalf("GET %s = %d: %s", url, resp.StatusCode, b)
	}
	if err := json.NewDecoder(resp.Body).Decode(dst); err != nil {
		t.Fatalf("decode %s: %v", url, err)
	}
}

// Package server exposes a recorded or in-flight execution's event stream over
// HTTP, so a browser client (the UI, M1.12) can watch a run live. It is a pure
// reader of the event log — the single source of truth (PRIN-02) — plus one
// injected hook to start a run; it never holds engine state of its own and
// never becomes a second record of what happened.
//
// The live transport is WebSocket via github.com/coder/websocket (ADR 0010,
// superseding ADR 0009's Server-Sent Events choice): one JSON text frame per
// domain.Event — byte-identical to the line-delimited JSON `wee run --json`
// emits. The client consumes it with the browser's built-in WebSocket. The
// stream is still functionally one-directional (server pushes, client only
// listens) — WebSocket was chosen to match spec/ui.md REQ-UI-02's original
// wording literally, not because this milestone needs full duplex.
package server

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"time"

	"github.com/coder/websocket"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/eventlog"
	"github.com/tzpereira/workflow-execution-engine/core/replay"
	"github.com/tzpereira/workflow-execution-engine/core/store"
)

// StartFunc begins a workflow execution and returns its id immediately; the run
// itself proceeds in the background (it must NOT be bound to the HTTP request's
// context, which ends when the POST returns). ref identifies the workflow to the
// concrete implementation — the CLI wires a runner-backed starter that resolves
// ref as a workflow file path. A nil StartFunc disables POST /api/run (501),
// leaving a read-only server that still streams and audits existing executions.
type StartFunc func(ref string) (execID string, err error)

// defaultPoll is how often the live WebSocket handler re-reads the log for new
// events. It matches `wee run`'s streamer tick: fast enough to feel live, cheap
// enough for a local dev tool. The client sees pushed frames, never this tail.
const defaultPoll = 40 * time.Millisecond

// Server serves the read side of the workspace over HTTP.
type Server struct {
	log       *eventlog.Log
	store     *store.Store
	workspace string
	start     StartFunc
	mux       *http.ServeMux
	poll      time.Duration
}

// New builds a Server rooted at the given workspace state directory (the same
// dir the engine writes under, conventionally ".workflow"). start may be nil.
func New(workspace string, start StartFunc) *Server {
	s := &Server{
		log:       eventlog.New(workspace),
		store:     store.New(workspace),
		workspace: workspace,
		start:     start,
		mux:       http.NewServeMux(),
		poll:      defaultPoll,
	}
	// Go 1.22 method+wildcard routing — no router dependency.
	s.mux.HandleFunc("GET /healthz", s.handleHealth)
	s.mux.HandleFunc("GET /api/executions", s.handleList)
	s.mux.HandleFunc("GET /api/executions/{id}", s.handleAudit)
	s.mux.HandleFunc("GET /api/executions/{id}/events", s.handleEvents)
	s.mux.HandleFunc("POST /api/run", s.handleRun)
	return s
}

// Handler returns the HTTP handler (CORS-wrapped so the Vite dev server on a
// different origin can call it).
func (s *Server) Handler() http.Handler { return withCORS(s.mux) }

// ListenAndServe runs the server until the process exits. No write timeout is
// set: the live WebSocket connection is deliberately long-lived.
func (s *Server) ListenAndServe(addr string) error {
	srv := &http.Server{Addr: addr, Handler: s.Handler(), ReadHeaderTimeout: 10 * time.Second}
	return srv.ListenAndServe()
}

func (s *Server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	_, _ = w.Write([]byte("ok"))
}

// ExecutionSummary is one row of GET /api/executions. Workflow/Version come from
// the ExecutionStarted event; State is "running" until an ExecutionFinished
// event carries the terminal state (PRIN-02: derived from the log, not a
// separate status store).
type ExecutionSummary struct {
	ID       string `json:"id"`
	Workflow string `json:"workflow"`
	Version  string `json:"version"`
	State    string `json:"state"`
}

func (s *Server) handleList(w http.ResponseWriter, _ *http.Request) {
	ids := s.listExecutionIDs()
	out := make([]ExecutionSummary, 0, len(ids))
	for _, id := range ids {
		out = append(out, s.summarize(id))
	}
	writeJSON(w, http.StatusOK, out)
}

// Audit is GET /api/executions/{id}: a full reconstruction of the execution —
// the frozen workflow (so the Inspector can show each node's Contract via
// Workers), every recorded event (the same reducer the live stream feeds, one
// code path for live or replayed), and each node's outcome plus its artifact's
// actual bytes (base64 on the wire) — everything REQ-UI-03/REQ-UI-04 need,
// reusing core/replay's reconstruction rather than re-deriving it.
type Audit struct {
	replay.Timeline
	State string `json:"state"`
}

func (s *Server) handleAudit(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tl, err := replay.NewAuditor(s.log, s.store).Audit(id)
	if err != nil {
		http.Error(w, "unknown execution", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, Audit{Timeline: tl, State: summarize(id, tl.Events).State})
}

// handleEvents upgrades to WebSocket and streams an execution's events,
// replaying everything recorded so far and then tailing live until the
// terminal ExecutionFinished event (always the last event a run emits —
// engine/scheduler.go), at which point the connection is closed with a normal
// closure status. A transient read error (log not yet created, or a torn
// trailing line under a concurrent append) is retried on the next tick, never
// surfaced — no event is lost or duplicated. OriginPatterns is permissive
// (matching withCORS below): this is a local dev tool, and the origin check is
// WebSocket's own cross-origin gate — the CORS headers withCORS sets have no
// effect on the upgrade itself.
func (s *Server) handleEvents(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: []string{"*"}})
	if err != nil {
		return // Accept already wrote the appropriate HTTP error response
	}
	defer func() { _ = conn.CloseNow() }() // best-effort if we return before an explicit Close

	id := r.PathValue("id")
	ctx := r.Context()
	ticker := time.NewTicker(s.poll)
	defer ticker.Stop()

	sent := 0
	for {
		if events, err := s.log.ReadAll(id); err == nil {
			for ; sent < len(events); sent++ {
				data, err := json.Marshal(events[sent])
				if err != nil {
					return
				}
				if err := conn.Write(ctx, websocket.MessageText, data); err != nil {
					return // client disconnected mid-write
				}
				if events[sent].Type == domain.ExecutionFinished {
					_ = conn.Close(websocket.StatusNormalClosure, "")
					return
				}
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

type runRequest struct {
	Workflow string `json:"workflow"`
}

type runResponse struct {
	ExecutionID string `json:"executionId"`
}

func (s *Server) handleRun(w http.ResponseWriter, r *http.Request) {
	if s.start == nil {
		http.Error(w, "run not configured on this server", http.StatusNotImplemented)
		return
	}
	var req runRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}
	if req.Workflow == "" {
		http.Error(w, "workflow is required", http.StatusBadRequest)
		return
	}
	execID, err := s.start(req.Workflow)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, runResponse{ExecutionID: execID})
}

// listExecutionIDs returns recorded execution ids, newest first — ids are
// timestamped, so reverse-lexical is reverse-chronological.
func (s *Server) listExecutionIDs() []string {
	entries, err := os.ReadDir(filepath.Join(s.workspace, "executions"))
	if err != nil {
		return nil
	}
	var ids []string
	for _, e := range entries {
		if e.IsDir() {
			ids = append(ids, e.Name())
		}
	}
	sort.Sort(sort.Reverse(sort.StringSlice(ids)))
	return ids
}

func (s *Server) summarize(id string) ExecutionSummary {
	events, err := s.log.ReadAll(id)
	if err != nil {
		return ExecutionSummary{ID: id}
	}
	return summarize(id, events)
}

// summarize derives a run's summary from its events alone. State defaults to
// "running" and is overwritten only by a terminal ExecutionFinished.
func summarize(id string, events []domain.Event) ExecutionSummary {
	sum := ExecutionSummary{ID: id, State: "running"}
	for _, ev := range events {
		switch ev.Type {
		case domain.ExecutionStarted:
			sum.Workflow, _ = ev.Payload["workflow"].(string)
			sum.Version, _ = ev.Payload["version"].(string)
		case domain.ExecutionFinished:
			if st, ok := ev.Payload["state"].(string); ok {
				sum.State = st
			}
		}
	}
	return sum
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// withCORS allows the browser UI (served from the Vite dev origin) to call this
// API cross-origin. It is a local dev tool; the permissive policy is scoped to
// that. Preflight OPTIONS is answered here so every route need not register it.
func withCORS(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
}

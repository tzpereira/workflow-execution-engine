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
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/coder/websocket"

	"github.com/tzpereira/workflow-execution-engine/core/domain"
	"github.com/tzpereira/workflow-execution-engine/core/eventlog"
	"github.com/tzpereira/workflow-execution-engine/core/registry"
	"github.com/tzpereira/workflow-execution-engine/core/replay"
	"github.com/tzpereira/workflow-execution-engine/core/serialize"
	"github.com/tzpereira/workflow-execution-engine/core/store"
)

// StartFunc begins a workflow execution and returns its id immediately; the run
// itself proceeds in the background (it must NOT be bound to the HTTP request's
// context, which ends when the POST returns). ref identifies the workflow to the
// concrete implementation — the CLI wires a runner-backed starter that resolves
// ref as a workflow file path. inputs supplies values for the workflow's
// declared Inputs (REQ-INPUT-01) — nil is fine for a workflow with none. A nil
// StartFunc disables POST /api/run (501), leaving a read-only server that
// still streams and audits existing executions.
type StartFunc func(ref string, inputs map[string]string) (execID string, err error)

// defaultPoll is how often the live WebSocket handler re-reads the log for new
// events. It matches `wee run`'s streamer tick: fast enough to feel live, cheap
// enough for a local dev tool. The client sees pushed frames, never this tail.
const defaultPoll = 40 * time.Millisecond

// Server serves the read side of the workspace over HTTP.
type Server struct {
	log          *eventlog.Log
	store        *store.Store
	workspace    string
	dir          string
	templatesDir string
	start        StartFunc
	mux          *http.ServeMux
	poll         time.Duration
}

// Config configures a Server. Workspace and Start are the only two most
// callers need; Dir and TemplatesDir exist for POST /api/run's workflow-path
// resolution and M1.14's template gallery respectively — both "" leaves the
// corresponding feature inert (Dir empty behaves as "." did before this
// field existed; TemplatesDir empty disables GET/POST /api/templates*).
type Config struct {
	// Workspace is the state directory the engine writes under
	// (conventionally ".workflow") — executions, artifacts, cache.
	Workspace string
	// Start begins a run; nil disables POST /api/run (501).
	Start StartFunc
	// Dir is the base directory POST /api/run's workflow paths — and a
	// template import's unpacked files — resolve against.
	Dir string
	// TemplatesDir holds `wee export` bundles (*.tar) for GET /api/templates
	// and POST /api/templates/{name}/import; "" means no templates configured.
	TemplatesDir string
}

// New builds a Server per cfg. Config.Start may be nil (a read-only server
// that still streams and audits existing executions).
func New(cfg Config) *Server {
	dir := cfg.Dir
	if dir == "" {
		dir = "."
	}
	s := &Server{
		log:          eventlog.New(cfg.Workspace),
		store:        store.New(cfg.Workspace),
		workspace:    cfg.Workspace,
		dir:          dir,
		templatesDir: cfg.TemplatesDir,
		start:        cfg.Start,
		mux:          http.NewServeMux(),
		poll:         defaultPoll,
	}
	// Go 1.22 method+wildcard routing — no router dependency.
	s.mux.HandleFunc("GET /healthz", s.handleHealth)
	s.mux.HandleFunc("GET /api/executions", s.handleList)
	s.mux.HandleFunc("GET /api/executions/{id}", s.handleAudit)
	s.mux.HandleFunc("GET /api/executions/{id}/events", s.handleEvents)
	s.mux.HandleFunc("POST /api/run", s.handleRun)
	s.mux.HandleFunc("GET /api/templates", s.handleListTemplates)
	s.mux.HandleFunc("POST /api/templates/{name}/import", s.handleImportTemplate)
	s.mux.HandleFunc("GET /api/workers/{id}", s.handleListWorkerVersions)
	s.mux.HandleFunc("POST /api/workers", s.handleSaveWorker)
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
// separate status store). SpentCostUSD/SpentTokens/DurationMs are cheap to
// derive from the same event read as everything else here (M1.14's history
// table, REQ-METRIC-01/02) — unlike the Inspector's per-node metrics (M1.13's
// richer Audit), a list row never needs artifact bytes, so this stays a plain
// event-log summary, no core/store touch.
type ExecutionSummary struct {
	ID           string  `json:"id"`
	Workflow     string  `json:"workflow"`
	Version      string  `json:"version"`
	State        string  `json:"state"`
	SpentCostUSD float64 `json:"spentCostUsd"`
	SpentTokens  int64   `json:"spentTokens"`
	// DurationMs is 0 until ExecutionFinished (an in-flight run's duration is
	// the live client's own concern, ticked from ExecutionStarted — the same
	// pattern Timeline.tsx already uses for a running node's bar).
	DurationMs int64 `json:"durationMs"`
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
	Workflow string            `json:"workflow"`
	Inputs   map[string]string `json:"inputs,omitempty"`
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
	execID, err := s.start(req.Workflow, req.Inputs)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, runResponse{ExecutionID: execID})
}

// Template is one row of GET /api/templates — enough for the gallery card
// (M1.14, REQ-UI-05): name, workflow identity, and node count. The bundle
// itself is only decoded (registry.Import), never registered against
// anything persistent — listing is read-only.
type Template struct {
	Name       string `json:"name"`
	WorkflowID string `json:"workflowId"`
	Version    string `json:"version"`
	NodeCount  int    `json:"nodeCount"`
}

func (s *Server) handleListTemplates(w http.ResponseWriter, _ *http.Request) {
	out := []Template{}
	if s.templatesDir == "" {
		writeJSON(w, http.StatusOK, out)
		return
	}
	entries, err := os.ReadDir(s.templatesDir)
	if err != nil {
		writeJSON(w, http.StatusOK, out)
		return
	}
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".tar") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(s.templatesDir, e.Name()))
		if err != nil {
			continue // a template that fails to read just doesn't appear — no partial gallery crash
		}
		reg, err := registry.Import(data)
		if err != nil {
			continue
		}
		_, wf, ok := reg.SoleWorkflow()
		if !ok {
			continue
		}
		out = append(out, Template{
			Name:       strings.TrimSuffix(e.Name(), ".tar"),
			WorkflowID: wf.ID,
			Version:    wf.Version,
			NodeCount:  len(wf.Nodes),
		})
	}
	writeJSON(w, http.StatusOK, out)
}

type importTemplateResponse struct {
	// WorkflowPath is what the UI passes back as POST /api/run's "workflow"
	// field — a relative path (with a subdirectory, unlike a browser file
	// input's bare basename) that resolves against this server's own Dir,
	// since the files were just written there.
	WorkflowPath string          `json:"workflowPath"`
	Workflow     domain.Workflow `json:"workflow"`
}

// handleImportTemplate unpacks a template bundle (registry.Import) and writes
// its workflow + Workers as real YAML files under <Dir>/<name>/ — reusing
// the exact same wee run/serve file-resolution path every other workflow
// goes through (runner.Load, POST /api/run), rather than inventing a second,
// in-memory execution path just for templates. "No UI-only/proprietary
// template format" (M1.14) cuts both ways: the bundle IS a real `wee export`
// archive, and importing it re-creates real, `wee run`-able files on disk.
func (s *Server) handleImportTemplate(w http.ResponseWriter, r *http.Request) {
	if s.templatesDir == "" {
		http.Error(w, "templates not configured on this server", http.StatusNotImplemented)
		return
	}
	name := r.PathValue("name")
	data, err := os.ReadFile(filepath.Join(s.templatesDir, name+".tar"))
	if err != nil {
		http.Error(w, "unknown template", http.StatusNotFound)
		return
	}
	reg, err := registry.Import(data)
	if err != nil {
		http.Error(w, "corrupt template bundle: "+err.Error(), http.StatusInternalServerError)
		return
	}
	_, wf, ok := reg.SoleWorkflow()
	if !ok {
		http.Error(w, "template bundle does not contain exactly one workflow", http.StatusInternalServerError)
		return
	}
	workers := reg.Workers(wf)

	destDir := filepath.Join(s.dir, name)
	if err := os.MkdirAll(destDir, 0o755); err != nil {
		http.Error(w, "create destination directory: "+err.Error(), http.StatusInternalServerError)
		return
	}
	wfYAML, err := serialize.MarshalYAML(wf)
	if err != nil {
		http.Error(w, "marshal workflow: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.WriteFile(filepath.Join(destDir, "workflow.yaml"), wfYAML, 0o644); err != nil {
		http.Error(w, "write workflow.yaml: "+err.Error(), http.StatusInternalServerError)
		return
	}
	for ref, worker := range workers {
		data, err := serialize.MarshalYAML(worker)
		if err != nil {
			http.Error(w, "marshal worker "+ref+": "+err.Error(), http.StatusInternalServerError)
			return
		}
		id, _, _ := strings.Cut(ref, "@")
		if err := os.WriteFile(filepath.Join(destDir, id+".worker.yaml"), data, 0o644); err != nil {
			http.Error(w, "write "+id+".worker.yaml: "+err.Error(), http.StatusInternalServerError)
			return
		}
	}

	writeJSON(w, http.StatusOK, importTemplateResponse{
		WorkflowPath: filepath.Join(name, "workflow.yaml"),
		Workflow:     wf,
	})
}

// workerVersionsResponse is GET /api/workers/{id}'s body — every version of
// that Worker id found on disk, oldest first, so the UI's version-history
// picker and "current" editable copy (the last entry) both come from one
// call. dir (a query param, "" for the server's own --dir root) lets the
// caller scope the scan to wherever the currently-open workflow's sibling
// Worker files actually live — the same nesting a template import creates
// (M1.14's handleImportTemplate writes into <dir>/<name>/, not <dir>/).
type workerVersionsResponse struct {
	Versions []domain.Worker `json:"versions"`
}

func (s *Server) handleListWorkerVersions(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	scanDir := filepath.Join(s.dir, r.URL.Query().Get("dir"))
	versions, err := scanWorkerVersions(scanDir, id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, workerVersionsResponse{Versions: versions})
}

type saveWorkerRequest struct {
	Worker domain.Worker `json:"worker"`
	Dir    string        `json:"dir"`
}

type saveWorkerResponse struct {
	Worker domain.Worker `json:"worker"`
}

// handleSaveWorker is M1.14c's in-UI editing write path: the submitted
// Worker's own Version field is never trusted as the version to write —
// editing always mints a new version (owner-confirmed 2026-07-20: "editar
// cria uma versão nova automaticamente, mas salva a anterior"), computed as
// one patch bump past whatever's already on disk for that id. The file the
// edit started from is never touched; LoadWorkers already resolves any
// *.worker.yaml file by its internal id/version fields, not by filename, so
// two versions of the same Worker coexisting as two files is the existing,
// unmodified loading behavior (cli/internal/runner/assemble.go) — nothing
// engine-side changes to make rollback possible.
func (s *Server) handleSaveWorker(w http.ResponseWriter, r *http.Request) {
	var req saveWorkerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "decode request: "+err.Error(), http.StatusBadRequest)
		return
	}
	if req.Worker.ID == "" {
		http.Error(w, "worker.id is required", http.StatusBadRequest)
		return
	}
	scanDir := filepath.Join(s.dir, req.Dir)
	existing, err := scanWorkerVersions(scanDir, req.Worker.ID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	req.Worker.Version = nextPatchVersion(existing)

	data, err := serialize.MarshalYAML(req.Worker)
	if err != nil {
		http.Error(w, "marshal worker: "+err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.MkdirAll(scanDir, 0o755); err != nil {
		http.Error(w, "create directory: "+err.Error(), http.StatusInternalServerError)
		return
	}
	fileName := req.Worker.ID + "@" + req.Worker.Version + ".worker.yaml"
	if err := os.WriteFile(filepath.Join(scanDir, fileName), data, 0o644); err != nil {
		http.Error(w, "write "+fileName+": "+err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, saveWorkerResponse{Worker: req.Worker})
}

// scanWorkerVersions reads every *.worker.yaml/*.worker.yml file directly in
// dir and returns the ones matching id, sorted oldest-version-first. A
// missing directory is an empty result, not an error (a workflow with no
// Workers, or one whose dir hasn't been created yet).
func scanWorkerVersions(dir, id string) ([]domain.Worker, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read dir %s: %w", dir, err)
	}
	var out []domain.Worker
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || (!strings.HasSuffix(name, ".worker.yaml") && !strings.HasSuffix(name, ".worker.yml")) {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		var wk domain.Worker
		if err := serialize.UnmarshalYAML(data, &wk); err != nil {
			continue
		}
		if wk.ID == id {
			out = append(out, wk)
		}
	}
	sort.Slice(out, func(i, j int) bool { return semverLess(out[i].Version, out[j].Version) })
	return out, nil
}

// nextPatchVersion returns one patch bump past the highest version in
// existing, or "1.0.0" if there are none yet. Only MAJOR.MINOR.PATCH is
// understood (every version in this project is plain semver) — a version
// string that doesn't parse as three integers is treated as lower than any
// that does, so a save still succeeds with a sane starting point rather than
// erroring on an unexpected format.
func nextPatchVersion(existing []domain.Worker) string {
	if len(existing) == 0 {
		return "1.0.0"
	}
	latest := existing[len(existing)-1].Version // scanWorkerVersions returns oldest-first
	major, minor, patch, ok := parseSemver(latest)
	if !ok {
		return "1.0.0"
	}
	return fmt.Sprintf("%d.%d.%d", major, minor, patch+1)
}

func parseSemver(v string) (major, minor, patch int, ok bool) {
	parts := strings.SplitN(v, ".", 3)
	if len(parts) != 3 {
		return 0, 0, 0, false
	}
	var err error
	if major, err = strconv.Atoi(parts[0]); err != nil {
		return 0, 0, 0, false
	}
	if minor, err = strconv.Atoi(parts[1]); err != nil {
		return 0, 0, 0, false
	}
	if patch, err = strconv.Atoi(parts[2]); err != nil {
		return 0, 0, 0, false
	}
	return major, minor, patch, true
}

func semverLess(a, b string) bool {
	aMaj, aMin, aPatch, aOK := parseSemver(a)
	bMaj, bMin, bPatch, bOK := parseSemver(b)
	if !aOK || !bOK {
		return a < b // unparseable — stable, arbitrary fallback, never crashes
	}
	if aMaj != bMaj {
		return aMaj < bMaj
	}
	if aMin != bMin {
		return aMin < bMin
	}
	return aPatch < bPatch
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
	var startedAt, finishedAt time.Time
	for _, ev := range events {
		switch ev.Type {
		case domain.ExecutionStarted:
			sum.Workflow, _ = ev.Payload["workflow"].(string)
			sum.Version, _ = ev.Payload["version"].(string)
			startedAt = ev.Timestamp
		case domain.ExecutionFinished:
			if st, ok := ev.Payload["state"].(string); ok {
				sum.State = st
			}
			finishedAt = ev.Timestamp
		case domain.WorkerFinished:
			if c, ok := ev.Payload["costUsd"].(float64); ok {
				sum.SpentCostUSD += c
			}
			if t, ok := ev.Payload["tokens"].(float64); ok {
				sum.SpentTokens += int64(t)
			}
		}
	}
	if !startedAt.IsZero() && !finishedAt.IsZero() {
		sum.DurationMs = finishedAt.Sub(startedAt).Milliseconds()
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

# Spec — Interface (Commercial Client)

**Prefix:** `REQ-UI` · **Status:** DRAFT (delivery M1.11 → M1.14) · **Principles:** PRIN-02, PRIN-06 ·
**Implementation:** `ui/` (React + TypeScript)

The interface is **not** the product — it is the best client of the Core. It consumes the same event
stream as `wee run --json` (via `wee serve`), and is never a second source of truth. A workflow built in
the UI exports to the canonical format and runs unmodified via `wee run`, and vice versa.

## UI/UX laws (normative for all interface work)

- **Precision, not excitement.** No AI aesthetics, glowing gradients, glassmorphism, or decorative
  animation. Reference points: Linear, Arc, Raycast, GitHub, Figma.
- **One workspace.** Canvas, inspector, timeline, artifacts, logs — no page navigation.
- **Every click answers a question.** No decorative panels; every panel reduces uncertainty.
- **Fast.** Keyboard-first, instant interactions, minimal loading.
- **Progressive disclosure.** A beginner runs a template immediately; an advanced user customizes every
  Worker.
- **Beautiful by subtraction.** Whitespace, typography, alignment, hierarchy — never visual noise.

### REQ-UI-01 — Visual builder over the canonical format
The UI shall provide a drag-and-drop graph builder (React Flow) that exports directly to the canonical
workflow format — no proprietary format, round-trippable with `wee` (byte-identical content hash).
- **Delivered by:** M1.11. **Verified by:** _pending_ (UI-built workflow runs unmodified via `wee run`).

### REQ-UI-02 — Live execution as a pure event consumer
While an execution runs, the UI shall render node status, data flow, and artifacts live, driven solely by
the `wee serve` event stream (HTTP + WebSocket) — parallel lanes visible (the flagship's three reviewers),
cache hits visually distinct.
- **Delivered by:** M1.12. **Verified by:** _pending_.

### REQ-UI-03 — Inspector
When a node is selected, the UI shall show its goal, contract, validation result, resolved context (what
the Worker actually saw — REQ-CTXPOL-03), inputs, artifacts, metrics, and cost — without modal chaos.
- **Delivered by:** M1.13. **Verified by:** _pending_.

### REQ-UI-04 — Artifact viewers
The UI shall render artifacts by type: diff, markdown, JSON, files, images, reports (REQ-ARTIFACT-03
supplies the type).
- **Delivered by:** M1.13. **Verified by:** _pending_.

### REQ-UI-05 — Metrics & templates
The UI shall surface the metrics of REQ-METRIC-01/02 (cost, usage, value proxies, cache hit rate) and ship
the template gallery (flagship + Bug Investigation, PRD Generation, Architecture Review) including the
verifier-node pattern (REQ-CONTRACT-05).
- **Delivered by:** M1.14. **Verified by:** _pending_.

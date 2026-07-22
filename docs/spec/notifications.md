# Spec — Notifications

**Prefix:** `REQ-NOTIFY` · **Status:** DRAFT (delivery M2.11) · **Principles:** PRIN-02, PRIN-06, PRIN-09,
PRIN-10 · **Decisions:** ADR 0014 (notifications model), ADR 0012 (transport-derived signals) ·
**Implementation:** `ui/`, `core/settings/` (M2.11)

Notifications tell a user when a run finishes, fails, or crosses a threshold — especially when the tab is
backgrounded — **without** touching the closed, hash-chained event log or pulling delivery into the engine.
They are derived client-side from the existing event stream (the same technique ADR 0012 used for
progress), delivered to **local surfaces** (in-app + browser/OS), and gated by configurable rules. External
channels stay workflow-defined (ADR 0014).

### REQ-NOTIFY-01 — Event-derived triggers, no new event type
The service and client shall derive notification triggers from the existing event stream and shall not write
any notification, heartbeat, or progress entry to the append-only, hash-chained event log.
- **Rationale:** PRIN-09 + REQ-EVENT-01 — the catalog stays closed and the chain free of non-semantic noise;
  same precedent as ADR 0012 progress.
- **Delivered by:** M2.11. **Verified by:** _pending_ (fold-from-events test; `domain.TestSchemaDrift`
  confirms the catalog is unchanged).

### REQ-NOTIFY-02 — In-app notification center
When a subscribed condition occurs, the UI shall present it as a transient toast and retain it in a
persistent, dismissible notification list.
- **Rationale:** PRIN-02 — a completed or failed run must be noticeable without hunting through the Timeline.
- **Delivered by:** M2.11. **Verified by:** _pending_.

### REQ-NOTIFY-03 — Browser/OS notifications, opt-in
While the user has granted permission, the UI shall raise a browser/OS notification for subscribed
conditions when the tab is not focused; absent permission, it shall fall back to the in-app center and shall
never block on the permission prompt.
- **Rationale:** PRIN-06 — useful when backgrounded, but degrades gracefully and is never required.
- **Delivered by:** M2.11. **Verified by:** _pending_ (against an injectable fake Notification API).

### REQ-NOTIFY-04 — Configurable rules
The service shall persist notification preferences — per-event-type toggles (finished, failed, cancelled,
budget-warning, budget-exceeded, contract-violation, approval-needed), threshold rules (cost ≥ X,
duration ≥ N, on-failure-only), and quiet hours — under the workspace settings, applying them before a
notification is shown.
- **Rationale:** PRIN-06 — dynamic, configurable notifications that avoid noise/fatigue; persisted with
  NFR-CTRL-01 durable writes, no secrets.
- **Delivered by:** M2.11. **Verified by:** _pending_.

### REQ-NOTIFY-05 — Delivery to external channels stays workflow-defined
The engine shall not deliver notifications to any channel outside the local machine; off-machine delivery
(webhook, Slack, email) shall be expressible only as a workflow-defined integration (an HTTP tool node),
never as a Core notifier.
- **Rationale:** PRIN-06 + local-first VISION — the same boundary source connections draw (ADR 0013);
  `core/engine` emits events, delivery is a client/workflow concern.
- **Delivered by:** M2.11 (boundary); external channels are a later workflow pattern, not this milestone.
  **Verified by:** _pending_ (import-boundary check: no outbound-delivery code in `core/engine`).

### NFR-NOTIFY-01 — Notifications never carry payloads or secrets
A notification shall carry status, identifiers, and metrics only, and shall never include artifact content
or secret material — most strictly for browser/OS notifications.
- **Rationale:** PRIN-10 / NFR-SEC-01 — a secret surfaced in an OS toast is as permanent a leak as one in
  the log.
- **Delivered by:** M2.11. **Verified by:** _pending_.

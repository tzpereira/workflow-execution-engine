# ADR 0014: Notifications — event-derived, local surfaces, delivery stays out of Core

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

The interface has **no notification system** (UI inventory, M2.2). A run finishing, failing, or exceeding
its budget is surfaced only passively: status dots and an in-panel banner inside the Timeline. A user who
starts a long run and switches tabs has no way to be told it is done. The project owner asked for
notifications **when something finishes**, and for them to be **dynamic / configurable**.

Two constraints shape the fork:

- **The event log is closed and hash-chained.** REQ-EVENT-01's catalog is *closed*; ADR 0007's chain must
  stay free of non-semantic noise (PRIN-09). ADR 0012 already set the precedent for derived, non-persisted
  signals (progress/liveness): compute from existing events, write nothing new to `events.jsonl`.
- **Local-first, Core stays clean.** PRIN-06 and the VISION business model keep delivery mechanisms out of
  the engine. The owner's decision (session 2026-07-21) scopes this phase to **local surfaces now** —
  in-app and browser/OS — with external channels (webhook/Slack/email) explicitly deferred.

## Decision

Notifications are a **client-side, event-derived** capability with configurable rules; delivery to anything
outside the local machine stays a workflow concern, never a Core one.

1. **Event-derived, no new event type.** Notification triggers are folded from the existing event stream
   (the same source as ADR 0012 progress) — terminal and threshold conditions computed client-side.
   **Nothing is written to `events.jsonl`;** the closed catalog (REQ-EVENT-01) and the hash chain (PRIN-09)
   are untouched.

2. **Two local surfaces.** (a) An in-app **notification center** — transient toasts plus a persistent,
   dismissible list; (b) **browser/OS notifications** via the Notification API, opt-in behind an explicit
   permission grant, for when the tab is backgrounded.

3. **Configurable rules.** Per-event-type toggles (finished, failed, cancelled, budget-warning,
   budget-exceeded, contract-violation, and approval-needed once M2.5 lands), **threshold rules** (notify
   only if cost ≥ X, duration ≥ N, or on failure), and **quiet hours / do-not-disturb**. Preferences persist
   in `.workflow/settings.json` (references-only, no secrets; NFR-CTRL-01 durable writes).

4. **Redaction by construction.** A notification carries status, identifiers, and metrics only — **never
   artifact content or secret material** (NFR-SEC-01). OS notifications in particular must never surface a
   payload; a leaked secret in an OS toast would be as permanent as one in the log.

5. **Delivery stays out of Core.** External channels — webhook, Slack, email — are **not** built now. When
   wanted, they are **workflow-defined integrations** (an HTTP tool node in the graph), never a Core
   notifier — the same boundary source connections draw in ADR 0013. `core/engine` emits events; turning an
   event into an outbound message off the machine is a client or workflow responsibility.

6. **Per-tab / per-run affordances.** Document and run tabs (REQ-UI-09) show completion badges derived from
   the same client-side fold — one derivation, many surfaces.

## Consequences

- **Easier:** a long or backgrounded run tells the user when it is done or broken; rule-based thresholds and
  quiet hours keep notifications from becoming noise; no change to the event catalog or hash chain.
- **Harder:** the client must fold rules from the event stream and manage the OS permission handshake and
  its denied/blocked states; and the team must resist the recurring pull to add a "Core notifier."
- **Neutral / limits:** local and single-user; team notifications and any off-machine delivery are later and
  out of scope here. Notifications are best-effort and derived — not part of the audit record, carrying no
  integrity guarantee (same status as ADR 0012 progress).
- **Revisit trigger:** a persisted notification/heartbeat event, a Core delivery channel, or any server-push
  to an external service each needs a new ADR.

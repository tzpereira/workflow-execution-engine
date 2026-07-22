# ADR 0015: UI product shell & visual system — expressive, themeable, disciplined

- **Status:** Accepted
- **Date:** 2026-07-21

## Context

The interface works but is not yet a product a developer, SM, PO, PM, or CTO would notice and adopt on
sight. The UI inventory (M2.2) found: no design tokens, **no dark mode**, status→color duplicated across ~5
files, a minimal command palette (three static groups, no icons/shortcuts/contextual actions), execution
"run tabs" but **no document/workflow tabs and no "+"**, no onboarding flow, no in-app docs, expand-to-modal
editing only for **read-only** artifacts (not editable fields, no markdown), hand-rolled metric bars confined
to the bottom panel, and a plain light dot-grid canvas.

The owner set the bar as **"a project that is inevitable to be noticed, well-regarded by companies, and
genuinely useful"** — ultra-professional. Crucially, the owner **chose to loosen** the current
`spec/ui.md` UI/UX law — *"Precision, not excitement … no gradients, glow, glassmorphism, or decorative
animation … beautiful by subtraction"* — **toward an expressive visual language** (session decision
2026-07-21), accepting the disclosed risk of drifting toward an "AI aesthetic."

The fork: **reconcile "expressive + ultra-professional + inevitable" with the existing UI/UX laws and the
VISION neighborhood** (Linear, Arc, Raycast, GitHub, Figma, Vercel) without sliding into consumer
AI-toy slop. The reconciliation hinges on one observation: the project's own reference neighborhood is
*already* expressive — Linear, Vercel, and Figma use depth, restrained gradients, and purposeful motion to
read as *premium*, not as toys. "Expressive" is therefore aligned with "professional" when anchored to that
standard; the old law over-corrected.

## Decision

We adopt a themeable, expressive-but-disciplined visual system and a multi-document shell, and amend the
UI/UX laws accordingly.

1. **Amend the visual law: "expressive, not decorative."** The `spec/ui.md` clause "precision, not
   excitement / beautiful by subtraction / no gradients, glow, glassmorphism, or decorative animation" is
   **replaced**. Depth (elevation), restrained gradients on key surfaces, and **purposeful** motion (state
   transitions and feedback, never idle/looping decoration) are allowed, anchored to the Linear / Vercel /
   Figma standard. The remaining laws stand: **one workspace, every click answers a question,
   keyboard-first, progressive disclosure.**

2. **Design-token foundation + light/dark.** A single semantic token layer (CSS custom properties) governs
   color, elevation, radius, motion, and spacing, with **light and dark themes** (system preference +
   explicit toggle), both meeting contrast AA. This removes the hardcoded-hex and duplicated-color debt the
   inventory found.

3. **One status/signal system, color-blind-safe.** A single module maps each status to
   `{color token, icon, label}`; every badge, dot ("sinaleiro"), border, and chart reads from it — replacing
   the ~5 duplicated maps. **Status is conveyed by color *and* icon *and* label — never color alone.**

4. **Canvas as a themed "whiteboard" surface.** A dot/grid surface (building on the existing React Flow
   background) legible in both themes — functional spatial orientation that also carries the premium feel.
   Initial layout gets sane spacing, **including a fix for palette-added nodes stacking at a fixed point**,
   plus an explicit re-layout action.

5. **Multi-document workspace, reconciling "one workspace."** "One workspace, no page navigation" is
   **refined, not broken**: one workspace may hold **multiple open workflow documents as tabs** with a "+"
   to create/open (VS Code / Figma style) — distinct from the existing execution/run tabs. REQ-UI-09 defines
   how document tabs relate to run state, unsaved edits, and close-with-running-execution.

6. **Interaction spine + editing.** The command palette (⌘K) becomes the primary action surface — icons,
   shortcut hints, and contextual actions (run, cancel, settings, templates, theme toggle, open document,
   jump to node). Editable long-text fields get an **expand-to-modal editor with markdown** that edits the
   **canonical value**, so round-trip content hashes stay byte-stable (REQ-UI-01 preserved).

7. **Hard guardrails (non-negotiable, they bound "expressive").**
   - **Accessibility:** WCAG 2.1 AA — full keyboard operation, visible focus, contrast in both themes, ARIA
     roles, and honoring `prefers-reduced-motion` (NFR-UI-01).
   - **Performance:** the canvas stays interactive at 200 nodes and dense KPI surfaces stay responsive
     during large outputs (NFR-UI-02).
   - **Legibility over volume:** maximum information is delivered by **hierarchy and progressive
     disclosure**, not clutter — density serves scanning.
   - **Still a developer tool:** it must read as CTO-grade tooling, not a consumer AI product — expressive by
     *craft*, not by noise. **No silent telemetry / phone-home** (privacy is part of the professional bar).

## Consequences

- **Easier:** a coherent, themeable, professional shell; a single place to restyle; color-blind and
  keyboard/AT users can pilot it; the product can credibly clear the "inevitable / CTO-grade" bar; the
  visual law is now internally consistent with the project's own reference neighborhood.
- **Harder:** a real token/theme system and an accessibility pass are upfront work; "expressive" demands
  taste and active review to not become slop; and VISION's neighborhood wording needed reconciliation (done
  in this pass) so the docs do not contradict themselves.
- **Neutral / limits:** single-user local; team theming/branding and a shared template/theme library are
  later (M2.7). In-app docs are versioned to the running binary (REQ-UI-15) to avoid drift.
- **Revisit trigger:** reverting to a restraint-only aesthetic, introducing telemetry, or adding a
  marketplace of themes each needs a new ADR.

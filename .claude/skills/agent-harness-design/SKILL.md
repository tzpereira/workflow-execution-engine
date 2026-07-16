---
name: agent-harness-design
description: Harness design principles for coding agents on long, autonomous tasks (multi-hour, multi-session, agent-generated codebases). Use when designing, simplifying, or debugging agent harnesses (planner/generator/evaluator, QA loops, context resets, AGENTS.md, docs-as-system-of-record, architecture linters, AI-code garbage collection). Based exclusively on two articles: "Harness design for long-running application development" (Anthropic, Mar 2026) and "Leveraging Codex in an agent-centric world" (OpenAI, Feb 2026).
---

# Harness Design for Coding Agents

Source: 2 articles. Anthropic (planner/generator/evaluator harness) and OpenAI (100%-agent-generated repository, 1M LOC, 0 hand-written code).

## Core principle

- Humans direct; agents execute. The engineer's role becomes: designing environments, specifying intent, building feedback loops (OpenAI).
- Every harness component encodes an assumption about what the model does NOT do on its own. Assumptions age. With every new model, remove pieces that are no longer load-bearing, one at a time (Anthropic).
- Base rule: "simplest possible solution; add complexity only when needed."

## 3-agent architecture (Anthropic)

Inspired by GANs: separate the doer from the judge.

1. **Planner**: expands a 1-4 sentence prompt into a full spec. Ambitious in scope, high-level (product + overall technical design). Do NOT detail implementation: errors in the spec cascade. Without a planner, the generator under-scopes.
2. **Generator**: implements 1 feature at a time (sprints). Self-evaluates before handing off to QA. Git for versioning.
3. **Evaluator (QA)**: uses Playwright to click through the running app like a real user. Grades against criteria with a hard threshold; failure = detailed feedback.

Agents communicate via files.

### Sprint contract
Before each sprint, generator and evaluator negotiate what "done" means and how it will be verified. Bridges the high-level spec and testable implementation.

### Why separate generator/evaluator
- Models praise their own work, even when mediocre (worse on subjective tasks).
- Tuning an external, skeptical evaluator is tractable; making the generator self-critical is not.
- Out of the box, Claude is a weak QA: it identifies bugs and then "decides it doesn't matter." Tuning loop: read evaluator logs → find divergences from human judgment → adjust the prompt. Several rounds.

### Making subjective quality gradable
"Is it pretty?" doesn't work. "Does it follow our design principles?" does. Anthropic's criteria (frontend):
1. Design quality (coherence, identity)
2. Originality (penalize "AI slop": purple gradients over white cards, templates)
3. Craft (typography, spacing, contrast)
4. Functionality (usability)

Weight 1 and 2 more heavily (the model is already good at 3 and 4). Calibrate the evaluator with few-shot examples + score breakdowns. Caution: the language of the criteria shapes the output ("museum quality" caused visual convergence).

Loop: 5-15 iterations; the generator decides after each evaluation: refine direction or pivot aesthetics.

## Context management

- **Context anxiety**: the model wraps up work early when it thinks context is about to run out. Compaction doesn't fix this (it doesn't give a "clean slate").
- **Context reset**: clear context + a structured handoff with state and next steps. Resolves anxiety, costs orchestration/tokens/latency.
- Better models need fewer resets (Opus 4.6 ran 2h+ coherently in a single session, with automatic compaction). Re-evaluate the need with every new model.

## Repository as system of record (OpenAI)

- **A giant AGENTS.md fails**: eats context, "everything important = nothing important," rots, unverifiable.
- Solution: AGENTS.md ~100 lines as an **index/map**, pointing into a structured `docs/` (design docs, active/completed exec plans, product specs, llms.txt references, ARCHITECTURE.md, tech-debt tracker).
- **Progressive disclosure**: small, stable entry point; the agent knows where to look for more.
- What the agent can't access in context **does not exist**. A Slack discussion, a Google Drive doc — both unreadable. Everything goes into versioned artifacts in the repo.
- Apply mechanically: linters and CI validate doc freshness/interlinking; a recurring "doc maintenance" agent opens fix-up PRs.
- Plans are first-class artifacts, versioned in the repo.

## Agent legibility > human preference

- Optimize the repo for an agent to read, inspect, validate, and modify.
- Prefer "boring" technologies: stable, composable, well represented in training data.
- Sometimes it's cheaper for the agent to reimplement a subset (e.g., a custom concurrency helper, 100% covered, wired into OpenTelemetry) than to depend on an opaque library.
- Make the app/logs/metrics legible to the agent: app bootable via a git worktree (one instance per change), Chrome DevTools Protocol (DOM, screenshots, navigation), ephemeral per-worktree observability (LogQL/PromQL). This is what makes instructions like "startup < 800ms" actionable.
- Code doesn't need to please human taste; it needs to be correct, maintainable, and legible to future agent runs.

## Enforce invariants, don't micromanage

- Hard limits + predictable structure = effective agents.
- Fixed layers per domain (Types → Config → Repo → Service → Runtime → UI); cross-cutting concerns only through a single interface (Providers). Enforced by custom linters (agent-generated) and structural tests.
- "Taste invariants": structured logging, naming conventions, file-size limits. Lint error messages written as correction instructions — they enter the agent's context.
- Specify the WHAT (validate data at the boundary), not the HOW (don't mandate Zod).
- Rules that would seem pedantic with humans become multipliers with agents: encoded once, enforced everywhere.
- Rigid architecture becomes an initial prerequisite (not something deferred until there are hundreds of engineers).

## Throughput changes the merge philosophy (OpenAI)

- Merge with minimal blocking; short PRs; flaky tests are a follow-up, not a blocker.
- When agent throughput >> human attention: fixing is cheap, waiting is expensive.
- Review shifts to agent-reviews-agent; human review becomes optional.
- PR loop ("Ralph Wiggum" style): agent reviews its own changes, requests reviews from other agents, responds to feedback, iterates until every reviewer approves.

## Entropy and garbage collection (OpenAI)

- Agents replicate existing patterns, including bad ones → drift is inevitable.
- Manual cleanup ("AI-residue Fridays," 20% of the week) doesn't scale.
- Solution: mechanical "golden principles" in the repo (e.g., shared utilities > ad hoc helpers; validate at boundaries, never "YOLO parsing") + recurring agent tasks that detect drift, update quality scores, and open refactor PRs (reviewable in <1 minute, auto-merge).
- Technical debt = a high-interest loan: pay it down continuously, in small installments.
- Human taste is captured once (a review comment, a bug) and encoded into a doc or a tool. If a doc isn't enough, it becomes code/lint.

## When the evaluator is worth the cost (Anthropic)

- Not a fixed yes/no. It's worth it when the task is BEYOND what the model reliably does alone.
- The frontier moves with each model: on Opus 4.5, the evaluator helped across the whole build; on 4.6, only at the edge of capability. Even on 4.6, QA caught real gaps (stub features, display-only interactions).
- Reference cost: a full harness is ~20x more expensive than solo ($200/6h vs $9/20min), but solo produced an app with a broken core feature.

## Practical checklist

1. Start simple; add a component only against an observed failure.
2. Separate generator from evaluator; tune the evaluator toward skepticism with few-shot examples.
3. Convert subjective quality into gradable criteria; weight the model's weak spots.
4. Sprint contracts: agree on "done" before coding.
5. Give the evaluator real access to the app (browser, logs, metrics), not static screenshots.
6. AGENTS.md = short index; knowledge lives in versioned, linted `docs/`.
7. Enforce invariants via linters with instruction-style messages; freedom within the limits.
8. Continuous GC: recurring anti-drift agents.
9. With every new model: re-read traces, remove obsolete scaffolding piece by piece, test new capabilities.
10. When the agent gets stuck, ask "what capability/tool/doc is missing?" — never "try harder." Have the agent itself write the fix.

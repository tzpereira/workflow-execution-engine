# Vision — Workflow Execution Engine

Repo: `workflow-execution-engine` · Binary: `wee`

## Premise

The goal is **not** to build another AI agent framework.

The goal is to build a platform that transforms human engineering processes into executable, auditable, observable workflows.

Today, engineering knowledge lives in documents, Slack conversations, and people's heads.

This project turns those processes into software.

Instead of documenting *how* a team works, teams define workflows that can actually execute.

> **Workflows are software.**

They have:

* source code
* versioning
* execution
* replay
* artifacts
* observability
* metrics
* auditability

LLMs are an implementation detail, not the product.

---

# Positioning

This project should feel closer to:

* GitHub Actions
* Temporal
* Raycast
* Linear
* VS Code
* Figma

than to:

* LangFlow
* Flowise
* CrewAI playgrounds
* prompt builders

The product is about **engineering systems**, not chatting with AI.

---

# Design Principles

## 1. Reproducible & Auditable

LLMs are not deterministic. The platform does not pretend otherwise.

What the platform guarantees:

* The **process** is deterministic: same workflow, same version, same graph, same contracts, same context policies.
* The **results** are recorded: every output, decision, and artifact is captured immutably.
* Any execution can be **replayed** (re-run with identical configuration) or **audited** (inspected exactly as it happened).

Same workflow + same version + same inputs = the same process, with fully recorded results.

Node-level caching closes the gap further: cached nodes return byte-identical outputs.

---

## 2. Observable

Every execution tells a story.

Not just a final answer.

Every decision, tool invocation, artifact creation, dependency and timing should be visible.

---

## 3. Composable

Small reusable nodes.

Reusable workflows.

Reusable contracts.

Composable tools.

Composable memories.

---

## 4. Engineering-first

Every concept should resemble software engineering.

Avoid AI buzzwords whenever possible.

Think:

* Contracts
* Workers
* Artifacts
* Executions
* Graphs
* Events

Instead of:

* Prompt Chains
* AI Flows
* Magic Agents

This applies to the project itself: it is a **workflow execution engine**, not a "multi-agent framework".

---

## 5. Cost-aware

Every workflow multiplies LLM cost by the number of Workers.

Cost is a first-class engineering constraint, not an afterthought.

* Every execution has a **budget**.
* Every node result is **cacheable**.
* Every metric includes **cost**.

---

## 6. Minimalism

Every feature must justify its existence.

If a feature does not improve execution, reproducibility, cost or developer experience, it probably doesn't belong.

---

# Product Philosophy

The product should answer one question:

> **How do we execute knowledge?**

Example:

Instead of documenting

```
Implement feature

↓

Review

↓

Fix

↓

Merge
```

the workflow becomes executable.

---

# Core Architecture (Open Source)

The Core is the product.

The interface is only one possible client.

The entire platform must be usable without any UI.

CLI-first.

API-first.

SDK-first.

---

## Stack

* **Core, CLI, SDK: Go.** Single static binary. Goroutine-native scheduler (parallel nodes, `context.Context` cancellation). Git/Terraform-grade distribution (`brew install`, `go install`).
* **Contracts: JSON Schema** (draft 2020-12). Language-neutral, the single source of truth in `schemas/`. The engine validates against it; the UI generates forms from it.
* **Interface: React + TypeScript.** A pure client over the engine's event stream (`wee serve`).
* **Hosted runtime (commercial): the same Go binary** in distroless containers. No Kubernetes at launch — serverless containers (Cloud Run / Fargate) until volume or isolation needs justify a cluster.

Two languages, one boundary: Go below the event stream, TypeScript above it. The boundary is impossible to violate.

---

## Feature — Workflow Runtime

Responsible for execution.

Responsibilities:

* graph traversal
* scheduling
* dependency resolution
* parallel execution
* conditional execution
* retries
* cancellation
* resumable executions
* budget enforcement

---

## Feature — Workflow Definition

Workflows should be serializable.

Possible formats:

* YAML
* JSON
* SDK

Example

```
Workflow

↓

Planning

↓

Implementation

↓

Parallel Reviews

↓

Fix

↓

Commit
```

No UI dependency.

---

## Feature — Workers

Avoid calling them Agents internally.

A Worker represents a role.

A Worker has:

* objective
* constraints
* tools
* context policy
* output contract

Workers should be interchangeable.

---

## Feature — Contracts

Never expose "Prompt" as a first-class concept.

Workers execute Contracts.

A Contract defines:

* Goal
* Rules
* Required output **schema** (JSON Schema, draft 2020-12)
* Constraints
* Success criteria

**Contracts are enforced, not suggested.**

* Every Worker output is validated against its schema.
* Invalid output triggers automatic retry with the validation error as feedback.
* Repeated failure fails the node explicitly.

A Contract without enforcement is just a prompt with a different name. Enforcement is what makes it engineering.

---

## Feature — Context Policies

One of the strongest differentiators.

Each Worker decides what context it can access.

Examples:

* Full history
* Parent output only
* Specific artifacts
* Diff only
* Summary only
* No memory

Example

Reviewer

↓

Reads only the generated diff.

Implementation

↓

Reads planning.

Fixer

↓

Reads reviewers.

This enables sophisticated engineering workflows.

---

## Feature — Node Cache

The second strongest differentiator.

Inspired by Turborepo / Nx.

A node's cache key is derived from:

* Worker version
* Contract version
* resolved inputs (artifacts)
* model + parameters
* tool versions

If the key matches a previous execution, the node **returns the cached artifact instead of calling the model**.

Consequences:

* Re-running a workflow after changing one node only re-executes downstream nodes.
* Replay of unchanged nodes is free and byte-identical.
* Cost drops dramatically during iteration.

Cache is content-addressed, local-first, remote-capable later.

---

## Feature — Budgets

Every execution declares a budget:

* max cost (USD)
* max tokens
* max duration
* max retries per node

The runtime enforces budgets and fails fast with a clear event.

No silent $40 executions.

---

## Feature — Artifact System

Everything produces artifacts.

Not text.

Artifacts.

Artifact types:

* Code
* Markdown
* JSON
* Diff
* Image
* File
* Report
* Test Result
* Metrics

Artifacts become inputs for downstream Workers.

Artifacts are immutable and content-addressed (which powers the Node Cache).

---

## Feature — Event System

Everything emits events.

Examples

WorkerStarted

WorkerFinished

ContractValidated

ContractViolation

CacheHit

CacheMiss

BudgetExceeded

ToolCalled

ArtifactCreated

Retry

Failure

MemoryRead

ExecutionFinished

Events power logs, replay and observability.

---

## Feature — Execution Engine

Execution object

Contains:

* state
* graph
* artifacts
* events
* metrics
* costs
* budget status
* cache hits/misses
* timestamps

Everything revolves around an Execution.

---

## Feature — Replay

Any execution can be replayed.

Two modes:

* **Audit replay**: inspect the recorded execution exactly as it happened. Zero cost.
* **Re-execution**: re-run with identical workflow, versions, graph and contracts. Cached nodes are reused; only invalidated nodes hit the model.

Replay is a first-class feature — and honest about what LLMs can and cannot guarantee.

---

## Feature — Versioning

Everything is versioned.

Workflow

Worker

Contract

Tool

Execution

No mutable production state.

---

## Feature — Tool Interface

Simple interface.

Workers can invoke tools.

Examples:

Git

Filesystem

Browser

Terminal

HTTP

Search

Custom tools

Nothing AI-specific.

---

## Feature — Memory

Minimal.

Workspace-scoped.

Artifact-based.

Avoid RAG.

Avoid vector databases in V1.

Keep memory simple.

---

## Feature — SDK (Go)

Developers should build workflows in code.

The SDK is Go — same module as the engine, which it embeds directly (no subprocess).

Example

```
workflow.New()

↓

workflow.Worker()

↓

workflow.Parallel()

↓

workflow.Merge()

↓

wf.Run(ctx)
```

A TypeScript authoring SDK comes later (commercial phase): it generates the same canonical YAML/JSON the Go engine executes.

---

## Feature — CLI

Everything should work from terminal.

Single static Go binary: `wee`.

Examples

```
wee run

wee replay

wee inspect

wee validate

wee export

wee cache

wee serve
```

The CLI should feel like Git or Terraform: one binary, instant startup, `brew install`.

---

# Interface (Commercial)

The interface is **not** the product.

It is the best way to interact with the Core.

---

## Feature — Visual Workflow Builder

Built with React Flow.

Drag-and-drop.

No-code editor.

Exports directly to the Core format.

No proprietary format.

---

## Feature — Execution Timeline

Every execution visualized.

Planning

↓

Implementation

↓

Reviewer A

↓

Reviewer B

↓

Fix

↓

Commit

Live updates.

Cache hits visually distinct from fresh executions.

---

## Feature — Inspector

Click any Worker.

See:

Goal

Contract

Contract validation result

Inputs

Artifacts

Execution

Metrics

Cost

No modal chaos.

---

## Feature — Artifact Viewer

Rich viewers for:

Diff

Markdown

JSON

Files

Images

Reports

---

## Feature — Live Execution

Nodes animate while executing.

Edges indicate data flow.

Artifacts appear in real time.

Feels alive.

---

## Feature — Metrics

Execution duration

Cost (per node, per execution)

Token usage

Cache hit rate

Retries

Contract violations

Failures

Worker timing

---

## Feature — Templates

Curated workflows.

Examples:

Code Review

Bug Investigation

PRD Generation

Documentation

Research

Architecture Review

Security Review

Release Notes

---

## Feature — Collaboration (Future)

Workflow sharing.

Execution sharing.

Version comparison.

Not part of MVP.

---

# Business Model

The Core is open source. Forever. BYO API key.

Individual developers running the CLI locally will never pay — and shouldn't. That audience is distribution, not revenue.

Revenue comes from what teams cannot easily self-host:

## Tier 1 — Hosted Execution (usage-based)

* Cloud-hosted runtime
* Remote node cache (shared across the team — one person's execution warms everyone's cache)
* Managed API keys with margin on compute/tokens
* Execution history retention

## Tier 2 — Team (per seat, ~$15–20/seat/month)

* Everything in Hosted
* Workflow sharing & permissions
* Shared template library
* Execution sharing (links)
* Version comparison
* RBAC

## What is explicitly NOT the model

* ~~$3.99/month consumer subscription~~ — open-source CLI users won't convert; the price signals a toy.
* Paywalling core features — kills adoption, kills portfolio value.

Sequencing: **portfolio first, revenue later.** The commercial layer must never distort the Core architecture. The remote cache and hosted runtime are natural extensions of the Core, not forks of it.

---

# UI Philosophy

The UI should communicate precision.

Not excitement.

No AI aesthetics.

No glowing gradients.

No glassmorphism.

No unnecessary animations.

The interface should feel like:

* Linear
* Arc
* Raycast
* GitHub
* Figma

The visual language should communicate confidence.

---

# UX Principles

## One workspace.

No page navigation.

Everything happens in one canvas.

Canvas

Inspector

Timeline

Artifacts

Logs

---

## Every click answers a question.

No decorative panels.

Every panel exists to reduce uncertainty.

---

## Fast.

Keyboard-first.

Instant interactions.

Minimal loading.

Minimal friction.

---

## Progressive disclosure.

Only reveal complexity when necessary.

A beginner can execute a template immediately.

An advanced user can customize every Worker.

---

## Beautiful by subtraction.

Whitespace.

Typography.

Alignment.

Hierarchy.

Never visual noise.

---

# Naming Philosophy

Names matter.

Avoid AI vocabulary.

Prefer engineering vocabulary.

Instead of

Prompt

Use

Contract

---

Instead of

Conversation

Use

Execution

---

Instead of

Chat

Use

Workspace

---

Instead of

Agent

Prefer

Worker

(or keep Agent only if it proves significantly clearer.)

---

Instead of

Memory

Prefer

Workspace

Artifacts

Context

depending on meaning.

---

Instead of

Multi-Agent Framework

Use

Workflow Execution Engine

The project name must follow its own rules.

---

# MVP Scope

The MVP should intentionally be small.

## Core

* Workflow runtime
* Workflow definitions
* Workers
* Contracts (with schema validation + retry-on-violation)
* Context policies
* Node cache (local)
* Budgets
* Artifact system
* Event system
* Replay
* CLI
* SDK
* Tool interface

Nothing more.

---

## Interface

* React Flow builder
* Live execution
* Inspector
* Timeline
* Artifact viewer
* Metrics
* Template gallery

Nothing more.

---

# Flagship Demo

One demo must sell the entire project in under 3 minutes, on a real repository, with a verifiable result.

## Pull Request Review & Auto-Fix

```
PR Diff

↓

Reviewer A (diff only — style & correctness)

Reviewer B (diff only — assumes the code is wrong)

Security Reviewer (diff only — vulnerabilities)

(all three in parallel)

↓

Fixer (reads reviews + diff)

↓

Test Runner (tool: terminal)

↓

Commit
```

Why this demo:

* Runs in minutes, not hours.
* Result is verifiable: tests pass, diff is readable.
* Shows every differentiator at once: parallel graph, context policies (diff only), contract enforcement (structured review output), artifacts (diff, report, test result), cache (re-run after tweaking one reviewer → only downstream re-executes), budget, timeline.

## Secondary Demos

Shown in docs, not in the pitch:

### Bug Investigation

Logs → Hypothesis → Patch → Tests → Review

### Product Requirements

Research → PM → Architect → Reviewer → PRD

### Architecture Review

Specification → Backend → Frontend → Security → Performance → Merge Recommendations

---

# Explicit Non-Goals

To preserve focus, **do not** include these in the MVP:

* Chat interface
* RAG
* Vector databases
* Multi-tenancy
* Billing
* Marketplace
* Fine-tuning
* Autonomous long-running agents
* Knowledge bases
* Team management
* Authentication complexity
* Enterprise features
* AI model hosting
* Promising deterministic LLM outputs

These may become integrations later, but they should not shape the initial architecture.

---

# Long-Term Vision

The ambition is to become the **execution layer for knowledge work**.

Just as Git transformed source code into versioned, collaborative assets, and GitHub Actions transformed CI/CD pipelines into executable workflows, this project aims to transform engineering, product, research, and operational knowledge into executable, auditable, reproducible systems.

The success criterion is not having the most capable AI agents. It is enabling organizations to encode how they work into workflows that are observable, composable, versioned, cost-controlled and reusable.

**The product should make users feel they are programming organizations, not prompting models.**

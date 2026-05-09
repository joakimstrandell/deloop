# Deloop Agent Rules

Design system workbench: a spatial canvas for rendering real React components with live token editing.

PRDs live in `docs/prd/`. Plans live in `docs/plans/`. Decisions live in `docs/adr/`. Domain glossary in `CONTEXT.md`.

## Roles

- **user** — the human. Sets direction, picks issues, owns final merge in manual mode.
- **Curator** — strategic. Owns ideation, `/to-prd`, `/to-issues`, PRD-level `/grill-with-docs`, occasional standalone `/triage`.
- **Orchestrator** — tactical. Owns `/kickoff` (triage Phase 1 + design grill Phase 2), `/co-review`, `/resume-orchestrator`, `/arch-review`.
- **Implementer** — subagent spawned by Orchestrator for a single issue. Worktree-isolated. Disposed after issue ships.
- **Reviewer** — subagent spawned by Orchestrator to review the PR. Same worktree as Implementer. Disposed after issue ships.

Curator and Orchestrator run as **two parallel Claude Code instances**. They share no context; the tracker (Linear) and `docs/` are the bridge. Role is established implicitly by the first skill invocation in a session.

## Core Invariants (never break)

- Canvas is a full-document iframe. Shell and canvas are separate browser documents.
- Shell <-> canvas communication is only via `postMessage`.
- Deloop runs inside the user project (`process.cwd()` is user root at runtime).
- `packages/cli` never imports browser APIs.
- `packages/app` never imports Node.js APIs.
- Shell and canvas both use standard Tailwind (no prefix). Isolation comes from iframe boundary.
- **Canvas fidelity.** The canvas iframe renders the user's component as it would render in their consuming app — same fonts, tokens, body styles, dark-mode mechanism. Deloop's chrome (card frames, labels, error UI) lives in a shadow root inside the iframe and is the only deliberate exception.
- `packages/app` (shell/canvas) implementation baseline is Tailwind CSS v4 and React 19 conventions.
- **Tests don't paper over bugs.** When a test reveals a defect — even one outside its original scope — fix the product, not the test. Test-layer "fixes" that dodge runtime symptoms a real user would hit are forbidden. When a product fix lands, prior test-layer mitigations get removed in the same PR (or a follow-up linked from it). Full rule: `docs/testing.md` "Tests Are Bug Detectors, Not Bug Workarounds".

## Skill bindings

- **Tracker:** Linear (via Linear MCP).
- **Issue ID format:** `AWK-<n>`.
- **Default branch:** `main`.
- **Branch naming:** `<type>/awk-<n>-<topic>` (types: `feat`, `fix`, `refactor`, `docs`, `test`, `task`).
- **Validation commands:** `pnpm check`, `pnpm test`.
- **Commit format:** Conventional Commits with `(AWK-XX)` suffix (workflow-infra commits omit the suffix).
- **Category labels:** `bug`, `enhancement`, `arch-review`. (No triage labels; Phase 1 decisions are transient.)
- **Scheduling for `/arch-review`:** weekly cron (operational setup; not code).

## Contract Source of Truth

- Message protocol definitions live in `packages/app/src/types.ts`.
- When changing message types, update both sender and receiver in the same commit.

## Delivery Source of Truth

- Linear is the source of truth for feature scope, AC, milestones, roadmap.
- One issue per branch/worktree, one PR per issue.
- Branch hygiene before each kickoff: `git fetch --prune` + delete merged local branches.

## Skills

- **Curator:** `/to-prd`, `/to-issues`, `/grill-with-docs`, `/triage` (standalone), `/resume-curator`.
- **Orchestrator:** `/kickoff`, `/co-review`, `/resume-orchestrator`, `/arch-review`. (`/triage` is invoked internally as a Phase 1 sub-procedure.)
- **Role-agnostic primitives:** `/diagnose`, `/improve-codebase-architecture`, `/test-driven-development`.

## Documentation

- `README.md` — project intro
- `CONTEXT.md` — domain glossary
- `AGENTS.md` (this file) — agent rules, roles, skill bindings, invariants
- `docs/workflow.md` — lifecycle composition (how work flows end-to-end)
- `docs/prd/` — initiative PRDs (`foundation.md` vision, `mN-<slug>.md` milestone, `<slug>.md` unscheduled)
- `docs/adr/` — architectural decisions
- `docs/plans/` — implementation plans (issue-level + initiative-level)
- `docs/testing.md`, `docs/code-review.md`, `docs/decision-records.md` — focused playbooks

Read on-demand when relevant.

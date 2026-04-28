# Deloop

Design system workbench: a spatial canvas for rendering real React components with live token editing.

See PRD: `~/Downloads/PRD-Deloop-v0.8.md`

## Core Invariants (never break)

- Canvas is a full-document iframe. Shell and canvas are separate browser documents.
- Shell <-> canvas communication is only via `postMessage`.
- Deloop runs inside the user project (`process.cwd()` is user root at runtime).
- `packages/cli` never imports browser APIs.
- `packages/app` never imports Node.js APIs.
- Shell and canvas both use standard Tailwind (no prefix). Isolation comes from iframe boundary.

## Contract Source of Truth

- Message protocol definitions live in `packages/app/src/types.ts`.
- When changing message types, update both sender and receiver in the same commit.

## Delivery Source of Truth

- Linear is the source of truth for feature scope and acceptance criteria.
- Default execution model is one issue per branch/worktree and one PR per issue.

## Agent Playbooks

- Workflow and Linear usage: `docs/agent/workflow.md`
- Testing strategy and required checks: `docs/agent/testing.md`
- ADR policy and decision logging: `docs/agent/decision-records.md`

## Terminology

- **Shell**: outer UI wrapper in `packages/app/src/shell/`.
- **Canvas iframe**: isolated rendering document in `packages/app/src/iframe/`.
- **User project**: project Deloop runs against at runtime.

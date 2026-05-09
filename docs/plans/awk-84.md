---
issue: AWK-84
branch: task/awk-84-playwright-per-project-workers
mode: manual
created_at: 2026-05-07T18:51:00Z
git_sha: 855c97d32e1a50be8998f43b9d6d530da47589e3
---

# Implementer Spawn Prompt — AWK-84

You are the Implementer for [AWK-84](https://linear.app/awkwardgroup/issue/AWK-84/investigate-per-project-playwright-workers-relax-suite-wide-workers1). Operate in your assigned worktree.

## Linear issue (full text)

**Title:** Investigate per-project Playwright workers (relax suite-wide workers:1)

**Status:** Backlog → moves to In Progress on spawn.
**Priority:** Low (4)
**Project:** Deloop
**Related:** AWK-75 (Vite middleware should honor user-project tsconfig path aliases) — the issue that introduced `workers: 1` in the first place.

### Original description (verbatim)

```
## Context

AWK-75 added a second e2e fixture (`e2e/fixtures/tsconfig-app-split/`) with its own Playwright project + webServer. To avoid resource contention between the two dev servers, `e2e/playwright.config.ts` was set to `workers: 1` globally.

## Gap

`workers: 1` is suite-wide. All e2e specs — including ones unrelated to the new fixture — now run serially. Likely fine for current suite size, but as e2e grows, total wall time rises with it.

## What "fixed" looks like

Investigate Playwright's per-project worker configuration (or per-webServer scoping). Confirm whether parallel workers are safe within a single project (or per-webServer), and relax `workers: 1` to per-project where safe. If Playwright doesn't yet support this granularity, document the constraint inline at the config site so future drive-bys don't lift it without context.

## Acceptance criteria

1. Either: workers config relaxed to per-project safely, with no flake added; OR a comment at `e2e/playwright.config.ts` documents why suite-wide `workers: 1` is the safe default until upstream Playwright support lands.

## Out of scope

* Refactoring fixtures or specs themselves.
```

## Locked scope decisions (from CPTO grill 2026-05-07)

**Acceptance criterion (refined):**

Pick exactly one of:

1. **Relax path** — change `e2e/playwright.config.ts` so e2e tests run with > 1 worker (per-project, per-webServer, or globally — your call based on what Playwright actually supports). Verified by:
   - 5 consecutive `pnpm test:e2e` runs locally, all green back-to-back.
   - CI green on first try on the PR (no `gh run rerun`). If CI flakes, treat the test instrumentation as broken per `docs/agent/testing.md` "Test Determinism" — fix the race, or fall back to path 2.
2. **Document path** — keep `workers: 1` as the safe default and add a comment at the config site explaining the constraint (what was tried, why parallelism was unsafe in this codebase as of investigation date, what would unblock relaxation later).

**Required in PR description regardless of path:**

- Before/after wall-time numbers from `pnpm test:e2e` (one local run before any change + one local run after, total wall time).
- Brief summary of what Playwright knobs were considered (`workers`, `fullyParallel`, per-project worker mechanisms, `test.describe.configure({ mode })`, etc.) and why the chosen path was selected.

**Out of scope (do not touch):**

- The two-webServer architecture itself. The second dev server (port 4243, `e2e/fixtures/tsconfig-app-split`) is structurally required: Deloop reads tsconfig at startup against `--root`, so different tsconfig layouts → different fixture roots → different boots. AWK-84 only investigates worker config, not whether to consolidate fixtures.
- Refactoring fixtures or specs themselves (already excluded in original AC).
- Changes to `fullyParallel` unless directly required for the chosen path; if changed, document the reasoning the same way.

**Mode:** manual. CEO co-reviews the worktree and owns the merge.

## Branch

`task/awk-84-playwright-per-project-workers`

## Rules from AGENTS.md (verbatim)

### Your role: Implementer

> **Implementer**: subagent spawned by CPTO for a single Linear issue. Lives in an isolated worktree. Disposed after issue ships.

### Core Invariants

> - Canvas is a full-document iframe. Shell and canvas are separate browser documents.
> - Shell <-> canvas communication is only via `postMessage`.
> - Deloop runs inside the user project (`process.cwd()` is user root at runtime).
> - `packages/cli` never imports browser APIs.
> - `packages/app` never imports Node.js APIs.
> - Shell and canvas both use standard Tailwind (no prefix). Isolation comes from iframe boundary.
> - **Canvas fidelity.** The canvas iframe renders the user's component as it would render in their consuming app — same fonts, tokens, body styles, dark-mode mechanism. Deloop's chrome (card frames, labels, error UI) lives in a shadow root inside the iframe and is the only deliberate exception.
> - `packages/app` (shell/canvas) implementation baseline is Tailwind CSS v4 and React 19 conventions.

(None of these are directly at risk for AWK-84 — the work is in `e2e/playwright.config.ts`. Listed for awareness only.)

### Implementer's local-validation contract

> Implementer does not report PR open until: all changes committed and pushed, `pnpm check` and `pnpm test` (unit + relevant E2E) pass locally, PR open with structured description (AC mapping, decisions, test evidence, risks), PR linked to Linear issue.

### Implementer judgment policy

> Best-guess and document in PR for ambiguous AC, multiple-valid-approach decisions, style/convention calls, refactor opportunities skipped. Return failure to CPTO only for truly blocking cases (corrupt state, unimplementable AC, missing context, destructive op outside scope).

### Delivery Source of Truth

> - Linear is the source of truth for feature scope, acceptance criteria, milestones, and roadmap.
> - One issue per branch/worktree, one PR per issue.
> - Branch naming: `<type>/awk-<n>-<topic>` per `docs/agent/workflow.md`.
> - Commit messages: Conventional Commits + issue key. Example: `feat(cli): scaffold .deloop config bootstrap (AWK-9)`.

### CPTO owns CI

> CI failures on the PR are review findings, not Implementer-blocking. Cycle 2 covers both review feedback and CI fixes in one Implementer pass. Merge gate: CI green before merge, CPTO verifies.

For AWK-84 specifically: a CI failure that is parallelism flake **does** block your relax claim. Either fix the determinism issue or fall back to the document path. Do not retry CI to mask flake.

## Playbooks (read on-demand)

- [docs/agent/workflow.md](docs/agent/workflow.md) — workflow rules, branch naming, Linear lifecycle.
- [docs/agent/testing.md](docs/agent/testing.md) — testing strategy. Read the "Test Determinism" and "Definition of Done" sections in particular; they govern how to handle any flake that surfaces during your investigation.
- [docs/agent/code-review.md](docs/agent/code-review.md) — PR description contract. Use the template verbatim.

## Architectural context

No ADRs gate this work. The change surface is `e2e/playwright.config.ts` plus possibly per-spec `test.describe.configure({ mode })` calls if you choose that route.

Relevant background:

- The two webServers exist because Deloop reads tsconfig at startup against `--root` (resolved once, cached for the process lifetime). Different tsconfig layouts → different fixture roots → different boots. This is structural, not arbitrary.
- The `chromium` project (port 4242) targets `packages/ui` (Deloop dogfood); the `chromium-tsconfig-app-split` project (port 4243) targets `e2e/fixtures/tsconfig-app-split/`. Each project's `testMatch` / `testIgnore` keeps specs scoped to their respective server.
- Specs reach canvas content via `frameLocator('iframe#canvas')`. The shell <-> iframe `postMessage` boundary means SSE channels and HMR events can interact across tabs in non-obvious ways under parallelism.

## Investigation hints (not prescriptive)

- Playwright's `workers` is suite-wide as of last research. Per-project worker counts are a recurring feature request; check current support level.
- `fullyParallel` is per-project, but it controls within-file parallelism, not the worker count.
- `test.describe.configure({ mode: 'serial' | 'parallel' })` lets specs opt into/out of parallelism per file/describe block.
- The two webServers contend for OS resources (file watchers, memory, CPU). Within a single project running against a single dev server, parallel browser contexts are the more interesting question.
- If you measure timing, capture it on a quiet machine (close other heavy processes) and report the conditions in the PR (cores, memory, anything that would change the numbers significantly).

## Required local validation before opening PR

- `pnpm check` passes (every package).
- `pnpm test` (unit + e2e) passes.
- If you took the relax path: 5 consecutive `pnpm test:e2e` runs all green, captured in PR evidence (e.g. `for i in 1 2 3 4 5; do pnpm test:e2e || echo FAILED-$i; done` and confirm no FAILED).
- Conventional Commits format with `(AWK-84)` suffix on every commit.

## Done criteria

- AC met: either the relax path with full evidence, or the document path with a thoughtful inline comment.
- PR opened on `task/awk-84-playwright-per-project-workers`, linked to the Linear issue, with structured description per `docs/agent/code-review.md` including:
  - Which path you took and why.
  - Before/after `pnpm test:e2e` wall-time numbers (both paths).
  - Summary of Playwright knobs considered and rejected.
  - 5x local-run evidence (relax path only).
  - Risks and follow-ups.
- Worktree left intact for review.
- Report back to CPTO with: PR URL + concise Implementer summary (what changed, AC mapping, decisions, risks).

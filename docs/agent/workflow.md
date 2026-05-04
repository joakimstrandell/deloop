# Agent Workflow

## Purpose

Default implementation flow for Deloop. Linear is the source of truth for what to build. Procedural orchestration lives in skills (`/kickoff`, `/co-review`, `/resume`); this document captures the rules those skills enforce.

## Default Flow

1. Linear issue exists (`AWK-xxx`); scope and AC are explicit.
2. CPTO runs `/kickoff` (grill, decision gate, spawn Implementer).
3. Implementer implements scope, runs all checks + tests locally, opens PR with structured description.
4. `/kickoff` chains into review automatically: CPTO spawns Reviewer in the same worktree.
5. Reviewer returns structured findings; CPTO arbitrates (accept/reject/defer); arbitrated findings posted on PR.
6. If changes needed: cold-respawn Implementer → cycle 2 (max). Cold-respawn Reviewer to re-review.
7. After review converges:
   - **Manual mode**: pause for CEO co-review of worktree; CEO merges (or asks CPTO to).
   - **Autonomous mode** (CEO opted in for this issue): CPTO verifies CI green, merges.
8. Reflect-then-clear: write memory entries, propose playbook drift PRs if applicable, update Linear, `/clear`.

One PR per issue. Split only if the issue is too large to review safely.

### Direct-to-main exception

Trivial unblocking infra fixes (CI config, dependency-pin updates, docs-only edits) may be committed directly to `main` only when CEO explicitly authorizes the specific change. Linear issue requirement still applies for code changes (file before commit, reference in commit message). Docs-only commits to agent playbooks may skip Linear (matches existing `docs(workflow): ...`, `docs(review): ...` precedent). Default remains branch + PR.

## Linear Requirement

- No implementation without a Linear issue (features, fixes, refactors).
- If work is identified during discussion, file the Linear issue before creating the branch.

## Branch and PR Naming

- Branch: `<type>/awk-<n>-<topic>` (types: `feat`, `fix`, `refactor`, `docs`, `test`, `task`).
- PR title: `feat(scope): short intent (AWK-XX)` (or matching type).
- PR description follows the structured contract (AC mapping, decisions, test evidence, risks).
- PR description must mention and link the Linear issue. Linear issue must include the PR URL.
- PRs without linked Linear issues are not merged.
- Commit messages: Conventional Commits + issue key. Example: `feat(cli): scaffold .deloop config bootstrap (AWK-9)`.

## Linear Status Lifecycle

- `Backlog` → `In Progress` (implementation started) → `In Review` (PR open) → `Done` (merged + AC verified).
- Scope changes during implementation/review: choose either broaden current issue (small/related) or split off new issue (substantial). Decide before continuing.

## Scope Control

- Do not implement work outside the current issue unless it blocks delivery.
- Blockers from missing prerequisites → file a separate Linear issue.
- Ambiguous AC → refine in Linear before implementation.

## PRDs

- Multi-PRD repo: `docs/prd/`.
- `docs/prd/foundation.md`: v0 application vision; evolves but doesn't get superseded.
- `docs/prd/<slug>.md`: per vertical-slice / feature initiative (descriptive slug, no version suffix).
- `docs/prd/README.md`: light index of active PRDs and their status.
- Write a PRD when initiative spans more than ~3 issues, introduces a user-facing concept, or has cross-cutting architectural impact. Below that threshold, Linear issue description suffices.
- Each issue references its parent PRD path in the issue description (e.g. `PRD: docs/prd/<slug>.md`).

## Plans Policy

Linear issue description is the default planning artifact. Create a plan in `docs/plans/` only when work is cross-cutting, high-risk, or architectural and cannot fit in one issue description. PRD = what + why; Plan = how; ADR = decision rationale.

## Worktree Lifecycle

- Implementer + Reviewer share one worktree per issue (Git allows only one branch checkout at a time).
- Created at Implementer kickoff. Persists through review cycles and follow-up commits.
- Deleted only after merge (or abandonment).
- Run branch hygiene before kickoff: `git fetch --prune` + delete local branches already merged to `main`.

## Sequential Execution

One issue in flight at a time per CPTO. No parallel Implementers. If parallelism is genuinely needed, run a second Claude Code instance with its own CPTO.

## Autonomous Mode

- Per-issue, verbal opt-in by CEO. CPTO confirms once before spawning.
- CPTO posts `Mode: autonomous (CEO-authorized)` on the PR for durable trace (used by `/resume`).
- CPTO may merge after review converges in autonomous mode.
- All other rules (Linear requirement, branch naming, max 2 cycles, scope, local validation) still apply.
- Autonomous mode does not authorize: direct-to-main commits, scope expansion, skipping required checks, or bypassing circuit breakers.

## Recovery

- On every cold start (new session, post-`/clear`, post-crash), CPTO runs `/resume` before accepting new instructions.
- `/resume` is read-only by default: scans Linear, git worktrees, and GitHub PRs; classifies in-flight issues; proposes actions.
- Source of truth for recovery: Linear status + git worktree state + GitHub PR thread (`CPTO arbitration:` history, `Mode: autonomous` trace).

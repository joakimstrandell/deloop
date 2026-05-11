# Agent Workflow

## Purpose

Default implementation flow for Deloop. The issue tracker is the source of truth for what to build. Procedural orchestration lives in skills (`/triage`, `/implement`, `/co-review`, `/resume`); this document captures the rules those skills enforce.

## Default Flow

1. Issue exists (`AWK-xxx`).
2. CPTO runs `/triage <ID>`: grills the issue, posts an Agent Brief comment, marks the issue `ready-for-agent`. CEO `/clear`s.
3. CPTO runs `/implement <ID>` (cold session): validates the brief, spawns Implementer in a fresh worktree.
4. Implementer implements scope, runs all checks + tests locally, opens PR with structured description.
5. `/implement` chains into review automatically: CPTO spawns Reviewer in the same worktree.
6. Reviewer returns structured findings; CPTO arbitrates (accept/reject/defer); arbitrated findings posted on PR.
7. If changes needed: cold-respawn Implementer → cycle 2 (max). Cold-respawn Reviewer to re-review.
8. After review converges:
   - **Manual mode**: pause for CEO co-review of worktree; CEO merges (or asks CPTO to).
   - **Autonomous mode** (CEO opted in for this issue): CPTO verifies CI green, merges.
9. Reflect-then-clear: propose playbook drift PRs if applicable, update the issue, `/clear`.

One PR per issue. Split only if the issue is too large to review safely.

### Direct-to-main exception

Trivial unblocking infra fixes (CI config, dependency-pin updates, docs-only edits) may be committed directly to `main` only when CEO explicitly authorizes the specific change. Issue requirement still applies for code changes (file before commit, reference in commit message). Docs-only commits to agent playbooks may skip the issue requirement (matches existing `docs(workflow): ...`, `docs(review): ...` precedent). Default remains branch + PR.

## Issue Requirement

- No implementation without an issue (features, fixes, refactors).
- If work is identified during discussion, file the issue before creating the branch.

## Branch and PR Naming

- Branch: `<type>/awk-<n>-<topic>` (types: `feat`, `fix`, `refactor`, `docs`, `test`, `task`, `chore`).
- PR title: `feat(scope): short intent (AWK-XX)` (or matching type).
- PR description follows the structured contract (AC mapping, decisions, test evidence, risks).
- PR description must mention and link the issue. The issue must include the PR URL.
- PRs without linked issues are not merged.
- Commit messages: Conventional Commits + issue key. Example: `feat(cli): scaffold .deloop config bootstrap (AWK-9)`.

## Status Lifecycle

- `Backlog` → `In Progress` (implementation started) → `In Review` (PR open) → `Done` (merged + AC verified).
- Scope changes during implementation/review: choose either broaden current issue (small/related) or split off new issue (substantial). Decide before continuing.

## Scope Control

- Do not implement work outside the current issue unless it blocks delivery.
- Blockers from missing prerequisites → file a separate issue.
- Ambiguous AC → refine the issue before implementation.

## PRDs

- Multi-PRD repo: `docs/prd/`.
- `docs/prd/foundation.md`: vision, positioning, mode taxonomy, language. Evolves but doesn't get superseded.
- `docs/prd/mN-<slug>.md`: milestone-aligned PRDs. One focus per milestone, mapped 1:1 to a milestone in the issue tracker. Numbered in the planned execution order.
- `docs/prd/<slug>.md` (no prefix): unscheduled initiatives.
- `docs/agent/prds.md`: PRD policy, layout, conventions, and template.
- Write a PRD when an initiative spans more than ~3 issues, introduces a user-facing concept, or has cross-cutting architectural impact. Below that threshold, the issue description suffices.
- Each issue references its parent PRD path in the issue description (e.g. `PRD: docs/prd/m2-screens.md`).

### PRD ↔ milestone lifecycle

The milestone PRD and the tracker milestone are the same scope from two angles. They stay in sync across five lifecycle steps:

1. **Grill** — sharpen the PRD (Problem, Scope, Decisions). Use `/grill-with-docs` to challenge it against `foundation.md`, `CONTEXT.md`, and existing ADRs. Decisions that pass the ADR bar (hard to reverse, cross-boundary, surprising-without-context) get an ADR; the PRD references it by name only.
2. **Milestone-assign** — when scope is firm, the `mN-` prefix locks the PRD to milestone N in the issue tracker. Both must exist; the PRD's header references the tracker milestone, the tracker milestone references the PRD path.
3. **Decompose** — break the PRD's Scope into issues (use `/to-issues`). Each issue's description includes `PRD: docs/prd/mN-<slug>.md`. Issues are the workable units; the PRD's Scope sections are the durable shape.
4. **Mutate during ideation, triage, or implementation** — scope is not frozen at grill time. Issues may be added, split, retitled, or rescoped during ideation, `/triage` grilling, or implementation. New issues belong to the milestone; redefined issues stay in the milestone unless they no longer fit.
5. **Sync back to PRD** — when issues are added, removed, or substantially redefined, the PRD's Scope or Out-of-scope sections are updated in the same change. The invariant is at milestone-level grain: the PRD describes _what the milestone delivers_, not every issue ID. Issue splits and AC tweaks inside an existing scope bullet do not require a PRD edit; new scope bullets and dropped scope do.

When the PRD and the issue tracker disagree, neither wins automatically — the disagreement is a smell. CPTO reconciles by editing whichever is wrong.

## Plans Policy

The issue description is the default planning artifact. Create a plan in `docs/plans/` only when work is cross-cutting, high-risk, or architectural and cannot fit in one issue description. PRD = what + why; Plan = how; ADR = decision rationale.

## Worktree Lifecycle

- Implementer + Reviewer share one worktree per issue (Git allows only one branch checkout at a time).
- Created at Implementer spawn (`/implement`). Persists through review cycles and follow-up commits.
- Deleted only after merge (or abandonment).
- Run branch hygiene before `/implement`: `git fetch --prune` + delete local branches already merged to `main`.

## Sequential Execution

One issue in flight at a time per CPTO. No parallel Implementers. If parallelism is genuinely needed, run a second Claude Code instance with its own CPTO.

## Autonomous Mode

- Per-issue, verbal opt-in by CEO. CPTO confirms once before spawning.
- CPTO posts `Mode: autonomous (CEO-authorized)` on the PR for durable trace (used by `/resume`).
- CPTO may merge after review converges in autonomous mode.
- All other rules (issue requirement, branch naming, max 2 cycles, scope, local validation) still apply.
- Autonomous mode does not authorize: direct-to-main commits, scope expansion, skipping required checks, or bypassing circuit breakers.

## Recovery

- On every cold start (new session, post-`/clear`, post-crash), CPTO runs `/resume` before accepting new instructions.
- `/resume` is read-only by default: scans the issue tracker, git worktrees, and GitHub PRs; classifies in-flight issues; proposes actions.
- Source of truth for recovery: issue tracker state + git worktree state + GitHub PR thread (`CPTO arbitration:` history, `Mode: autonomous` trace).

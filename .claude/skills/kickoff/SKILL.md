---
name: kickoff
description: CPTO entry point for starting work on a Linear issue. Grills the issue, runs the decision gate, spawns the Implementer, and chains automatically into review. Use when starting implementation of a Linear issue (e.g. "/kickoff AWK-12", "let's start AWK-7", "kickoff this issue autonomous").
---

You are the **CPTO** (see `AGENTS.md`). This skill drives the full issue cycle: grill → spawn Implementer → review → arbitrate → cycle 2 if needed → merge step.

## Phase 1 — Mode + issue selection

1. **Detect mode.** If the CEO's invocation includes "autonomous", "you have the wheel", or similar explicit phrase, this is autonomous mode. Otherwise manual. Default is manual; if ambiguous, ask.
2. **Confirm mode once.** If autonomous: respond with one line — "Running AWK-X autonomously. Will merge after review converges. Acknowledged." Then proceed without further per-step confirmation (subject to circuit breakers below).
3. **Identify the issue.** If named, fetch via Linear MCP. If not, list relevant `Backlog`/`In Progress` issues; ask CEO to pick.

## Phase 2 — Grill the issue

Walk the decision tree, one question at a time, recommended answer for each. Drill until AC are unambiguous and testable. Read the codebase to answer questions when possible instead of asking.

- Manual mode: grill the CEO directly.
- Autonomous mode: spawn an Explore or Plan subagent to red-team the issue, then act on findings yourself. No CEO round-trip.

Update Linear with refinements (tightened AC, decomposed scope, notes). Split the issue if it grew substantially.

## Phase 3 — Decision gate

Confirm before spawning:

- Linear issue ID (`AWK-XX`)
- Mode (manual / autonomous)
- Worktree (isolated default)
- Branch hygiene done (`git fetch --prune` + delete merged local branches)

## Phase 4 — Spawn Implementer

`Agent` tool, `isolation: "worktree"`, fresh agent. Self-contained prompt — assume no auto-load. Include:

- Linear issue: ID, full description, full AC list (paste).
- Branch name: `<type>/awk-<n>-<topic>`.
- Pointers + brief paste of relevant rules from `AGENTS.md` (orchestration rules, core invariants, Implementer's local-validation contract, judgment policy).
- Pointers to playbooks: `docs/agent/workflow.md`, `docs/agent/testing.md`, `docs/agent/code-review.md` (PR description contract).
- Architectural context: relevant ADRs, message-protocol notes, package boundaries.
- Required-checks reminder: all `pnpm check` + `pnpm test` (unit + relevant E2E) must pass locally before reporting back.
- Conventional Commits format with issue key.
- **PR description contract** (paste the template from `code-review.md`).
- Instruction: open a PR linked to the issue when all local checks/tests are green. Do not delete the worktree. Report back with PR URL + Implementer summary.

Record worktree path. Update Linear: status → `In Progress`, link the worktree.

## Phase 5 — Autonomous-mode PR trace

If autonomous: as soon as the Implementer reports the PR URL, post a one-line comment on the PR: `Mode: autonomous (CEO-authorized)`. This is the durable trace `/resume` uses to recover mode after a crash.

## Phase 6 — Chain into review

After Implementer reports PR URL:

1. Update Linear: status → `In Review`, link PR.
2. Invoke the `/co-review` skill flow with: PR URL, worktree path, Linear issue ID, mode.

`/kickoff` does not return to the CEO between phase 4 and review. The review chain is automatic in both modes.

## Circuit breakers (autonomous mode pauses and asks CEO)

Pause and ask the CEO when:

- Scope ambiguity unresolvable from issue context.
- About to take a destructive operation outside the standard merge flow.
- A must-fix finding where CEO acceptance is uncertain.
- CI fails repeatedly after one `gh run rerun` retry (likely real, not flake).
- Implementer returns failure with a truly-blocking reason (corrupt state, unimplementable AC, missing context).

## Notes

- One Implementer per issue. Sequential only.
- Cold respawn for cycle 2 (no `SendMessage`); `/co-review` handles that.
- Worktree stays alive through merge.

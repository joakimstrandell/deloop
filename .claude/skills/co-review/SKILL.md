---
name: co-review
description: Orchestrator entry point for reviewing a PR. Spawns the Reviewer subagent in the existing worktree, arbitrates findings, runs up to 2 cycles, hands to the merge step, then reflect-and-clear. Auto-chained from /kickoff; also usable standalone for PRs opened outside a /kickoff flow (user-written PR, external contributor, post-/resume-orchestrator).
---

You are the **Orchestrator**. This skill drives the review-through-merge phase. Tracker, branch conventions, validation commands, and label vocabulary are defined in `AGENTS.md § Skill bindings`.

## Inputs

- PR URL.
- Worktree path (where the Implementer ran).
- Tracker issue ID.
- Mode (manual / autonomous).

If invoked standalone and any of these are unclear, ask before spawning.

## Phase 1 — Spawn Reviewer (cycle 1)

`Agent` tool, **no `isolation: "worktree"`** (use the existing worktree). Pass path explicitly. Fresh agent. Self-contained prompt:

- Worktree path the Reviewer must `cd` into.
- PR URL.
- Tracker issue: ID, description, AC list (paste).
- Brief paste of relevant `AGENTS.md` invariants.
- Reviewer output contract from `docs/code-review.md` (paste the format).
- Required checks per `AGENTS.md § Skill bindings` (project's check + test commands; relevant E2E).
- Instruction: read the diff, run tests in worktree, verify AC mapping in the PR description against the diff, draft structured findings, return to Orchestrator. Do not post on the PR — Orchestrator posts arbitrated findings.

## Phase 2 — Orchestrator arbitration

When Reviewer returns findings:

1. Read each finding. Spot-read specific file:line if a finding is unclear; do not re-read the full diff.
2. For each: **accept** / **reject** / **defer**. Reject only when Reviewer is wrong. Defer means out of scope → file new tracker issue, link in arbitration comment.
3. Post a single PR review comment prefixed `Orchestrator arbitration:` with the call on each item. For deferred items, include the new tracker issue link.
4. If verdict is `ready` and no must-fix items: skip phase 3, go to phase 4.

## Phase 3 — Cycle 2 (cold respawn)

Cold-respawn Implementer with:

- Worktree path (still alive).
- PR URL.
- The arbitrated change list (only accepted items).
- Same local-validation contract as cycle 1 (all checks + tests green before reporting back).
- Reminder: this is cycle 2; final pass.

When Implementer reports follow-up commits, cold-respawn Reviewer with:

- Worktree path, PR URL, tracker issue.
- The cycle-1 arbitrated change list as context.
- Instruction: re-review focused on the arbitrated items + diff since cycle 1. Flag new issues introduced.

Orchestrator arbitrates cycle 2 findings the same way. After cycle 2, all open items are arbitrated to lock scope. **No third cycle.** In-scope must-fixes either land in this PR (final Implementer pass, no further review) or block merge.

## Phase 4 — Merge step

Verify CI is green on the PR. If red:

- One `gh run rerun` retry.
- If still red and the failure looks real (not flake), this is a circuit breaker in autonomous mode → ask the user. In manual mode, surface to the user at co-review.

Then:

- **Manual mode**: respond to the user with PR URL, worktree path, summary of what landed and what was deferred. Stop and wait. The user does the local co-review and merge (or asks the Orchestrator to merge after their inspection).
- **Autonomous mode**: merge with the project's convention (check recent merged PRs if unsure of squash vs rebase). Use `gh pr merge --squash --delete-branch` (or matching convention).

After merge:

1. Sync local default branch (per `AGENTS.md § Skill bindings`): `git checkout <default-branch> && git pull --ff-only`.
2. Delete the local branch: `git branch -d <branch>`.
3. Remove the worktree: `git worktree remove <path>`.
4. Update the tracker: status → `Done`, paste a one-line completion note linking the merge commit.

The plan file at `docs/plans/<issue-id>.md` is **retained** as a historical record (per workflow redesign §11.5).

## Phase 5 — Reflect-and-clear

Required after every merge, both modes:

1. Reflect (write, don't just chat). For each surprise or pattern, pick the right home:
   - Same friction surfaced twice, or a rule worth codifying? → propose a playbook PR (`AGENTS.md` or `docs/*.md` playbook). Project-level lessons live in checked-in docs, not memory files.
   - Strategic / product thread to remember? → tracker comment on the consuming issue or initiative.
   - Doesn't pass either bar? → drop it. Don't write a memory entry as a default catch-all.
2. `/clear` before next `/kickoff`. Each new kickoff runs cold.

Periodic architecture reviews are triggered by cron (or user invocation), not by post-merge counters. See `/arch-review`.

## Notes

- One Reviewer at a time per issue. Cold respawns; never two Reviewers in parallel.
- Reviewer and Implementer never communicate directly — Orchestrator is always in the middle.
- Worktree only goes away after merge or abandonment.
- If Implementer or Reviewer fails mid-task, treat as a circuit breaker. Investigate before respawning blindly.

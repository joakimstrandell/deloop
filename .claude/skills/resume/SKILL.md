---
name: resume
description: Cold-start recovery for CPTO. Scans Linear, git worktrees, and GitHub PRs to find in-flight issues, classifies their state, and proposes resume actions. Read-only by default.
---

You are the **CPTO**. This skill reconstructs in-flight state after a session restart, crash, or `/clear`.

**Read-only by default.** Report state and propose actions; do not respawn, merge, or modify anything until the CEO confirms (or until the issue's autonomous-mode trace authorizes it — see phase 3).

## Phase 1 — Scan sources of truth

Run in parallel:

1. **Linear**: list issues with status `In Progress` or `In Review`. Also list issues labeled `ready-for-agent` (the triage state preceding implementation).
2. **Git**: list worktrees (`git worktree list`); note which branch each holds and whether it's clean or dirty.
3. **GitHub**: list open PRs in the repo. For each, capture title, branch, CI status, and the PR comment thread.

## Phase 2 — Classify each in-flight issue

For each Linear issue from phase 1, find the matching worktree and PR. Classify state:

- **Triaged, not yet spawned** (Linear labeled `ready-for-agent`, Agent Brief comment present, no worktree, no PR): triage finished but `/implement` never ran. Action: propose `/implement <ID>`.
- **Implementation incomplete** (no PR, dirty worktree): Implementer was mid-task. Cold respawn needed with the Agent Brief + "resume from current worktree state".
- **PR open, no Reviewer findings posted, no `CPTO arbitration:` comments**: cycle 1 review not started. Action: spawn Reviewer.
- **PR open, `CPTO arbitration:` posted with accepted items, no follow-up commits since**: cycle 2 Implementer pending. Action: cold-respawn Implementer with arbitrated change list.
- **PR open, follow-up commits since cycle-1 arbitration, no cycle-2 arbitration yet**: cycle 2 review pending. Action: cold-respawn Reviewer.
- **PR open, cycle-2 arbitration posted, CI green**: ready for merge step. Action: hand to merge phase of `/co-review`.
- **PR merged but worktree/branch not cleaned**: cleanup only.
- **Linear says `In Progress`/`In Review` but no matching PR or worktree**: orphaned state. Surface to CEO; do not auto-act.

## Phase 3 — Detect mode (autonomous vs manual)

For each in-flight issue, scan the PR thread for `Mode: autonomous (CEO-authorized)`. If present, this issue was authorized for autonomous mode before the crash. CPTO may resume autonomously.

If absent, treat as manual: surface state to CEO and wait for explicit direction before respawning subagents.

## Phase 4 — Report and propose

Output a concise table to the CEO:

```
Found N in-flight issue(s):

AWK-12: cycle 2 mid-review (autonomous-authorized)
  worktree: <path>  PR: <url>  CI: green
  → propose: cold-respawn Reviewer for cycle-2 review

AWK-15: PR ready for merge (manual)
  worktree: <path>  PR: <url>  CI: green
  → propose: hand to /co-review merge phase; await CEO co-review

AWK-18: implementation incomplete (autonomous-authorized)
  worktree: <path> (dirty)  PR: none
  → propose: cold-respawn Implementer with original AC + current state

Proceed?
```

In autonomous mode (per-issue trace), CPTO may proceed without per-issue confirmation but should still announce intent in one line before each action.

In manual mode, wait for explicit CEO sign-off per issue.

## Phase 5 — Resume

For each confirmed issue, hand off to the appropriate skill phase:

- Triaged, not yet spawned → `/implement <ID>`.
- Implementation incomplete → `/implement` phase 2 (Spawn Implementer) with worktree-resume context (pass the existing dirty worktree path; do not create a new one).
- Cycle 1 review pending → `/co-review` phase 1.
- Cycle 2 Implementer pending → `/co-review` phase 3 (Implementer leg).
- Cycle 2 Reviewer pending → `/co-review` phase 3 (Reviewer leg).
- Merge pending → `/co-review` phase 4.
- Cleanup only → run worktree/branch cleanup, update Linear to `Done` if PR is merged.

Each resumed issue runs sequentially per the project's no-parallelism rule.

## Notes

- This skill never modifies repo state, Linear, or PRs in its read-only phases (1-4). Only phase 5 (after CEO/autonomous-trace authorization) takes action.
- If multiple in-flight issues exist, surface all of them in phase 4. Do not auto-pick which to resume first.
- If recovery uncovers an inconsistency (PR merged but Linear says `In Review`, or worktree exists but branch is gone), surface as anomaly; do not auto-correct.

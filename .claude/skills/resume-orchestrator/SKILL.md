---
name: resume-orchestrator
description: Cold-start recovery for Orchestrator. Scans the tracker, git worktrees, GitHub PRs, and docs/plans/ for in-flight implementation work. Read-only by default.
---

# Resume — Orchestrator

You are the Orchestrator. This skill reconstructs tactical in-flight state after a session restart, crash, or `/clear`.

**Read-only by default.** Report state and propose actions; do not respawn, merge, or modify until the user confirms (or until the issue's autonomous-mode trace authorizes it — see Phase 3).

Tracker, branch, and label conventions are defined in `AGENTS.md § Skill bindings`.

## Phase 1 — Scan sources of truth

Run in parallel:

1. **Tracker:** list issues in `In Progress` or `In Review`.
2. **Git:** `git worktree list`. Note branches and clean/dirty state.
3. **GitHub:** open PRs in the repo. Capture title, branch, CI status, and PR comment thread.
4. **Plans:** files in `docs/plans/<id>.md` (issue-level — those with `issue:` frontmatter).

## Phase 2 — Classify

For each in-flight item, determine state:

- **Post-grill, pre-spawn** (plan exists, no worktree, no PR) → propose `/kickoff <ID>` to spawn Implementer.
- **Implementation incomplete** (no PR, dirty worktree) → cold respawn Implementer with worktree-resume context.
- **PR open, no review yet** → spawn Reviewer (cycle 1).
- **PR open, `Orchestrator arbitration:` posted, no follow-up commits** → cold-respawn Implementer (cycle 2).
- **PR open, follow-up commits since cycle-1 arbitration, no cycle-2 arbitration** → cold-respawn Reviewer.
- **PR open, cycle-2 arbitration posted, CI green** → hand to `/co-review` merge phase.
- **Merged but worktree/branch not cleaned** → cleanup only.
- **Tracker says In Progress/In Review but no matching PR/worktree/plan** → orphan; surface to user.

## Phase 3 — Detect mode

Scan PR thread for `Mode: autonomous (user-authorized)` (or legacy `Mode: autonomous (CEO-authorized)`). If present, Orchestrator may resume autonomously. Otherwise manual.

## Phase 4 — Report and propose

Concise table to the user. Each row: ID, state, classification, proposed action.

## Phase 5 — Resume

For each confirmed item, hand off to the appropriate skill phase (`/kickoff` Phase 4, `/co-review` phase X, or cleanup-only).

## Notes

- Phase 1–4 never modify state.
- If recovery surfaces inconsistency (PR merged but tracker says In Review, etc.), surface as anomaly; do not auto-correct.

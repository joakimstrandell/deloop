# Subagent Orchestration

How CPTO orchestrates Implementer and Reviewer subagents. For the higher-level process (Linear → branch → PR → merge, worktree/sequential/autonomous mode/recovery), see [workflow.md](workflow.md).

## Spawning

- **Fresh agents per issue.** New Implementer and Reviewer per Linear issue. Never reuse across issues. Reusable knowledge → playbooks, memory, or Linear; never agent context.
- **Cold respawn for cycles.** `SendMessage` is not available; cycle 2 of either subagent is a cold respawn with the prior arbitration context pasted into the prompt.
- **Shared worktree.** Implementer and Reviewer for the same issue use the same worktree path. Git allows only one checkout of a branch at a time. The Reviewer subagent runs **without** the `isolation: "worktree"` flag and `cd`s into the existing path.

## Review Cycles

- **Max 2 review cycles.** After cycle 2, CPTO arbitrates remaining items and locks scope. Out-of-scope items become new Linear issues.
- **CPTO arbitrates.** When Implementer and Reviewer disagree, CPTO decides. Decision logged on the PR with `CPTO arbitration:` prefix.

## Autonomous Circuit Breakers

Even in autonomous mode, CPTO pauses and asks the CEO for:

- Scope ambiguity it cannot resolve from issue context.
- Destructive operations beyond the standard merge flow.
- Must-fix findings where CEO acceptance is uncertain.
- Repeated CI failure that may be flake (one `gh run rerun` retry, then ask).

## Implementer Contracts

- **Local-validation contract.** Implementer does not report PR open until:
  - All changes committed and pushed.
  - All required local checks pass (see [docs/agent/testing.md](testing.md)).
  - PR open with structured description (AC mapping, decisions, test evidence, risks).
  - PR linked to Linear issue.
- **CPTO owns CI.** CI failures on the PR are review findings, not Implementer-blocking. Cycle 2 covers both review feedback and CI fixes in one Implementer pass. Merge gate: CI green before merge, CPTO verifies.
- **Judgment policy.** Best-guess and document in PR for ambiguous AC, multiple-valid-approach decisions, style/convention calls, and refactor opportunities skipped. Return failure to CPTO only for truly blocking cases (corrupt state, unimplementable AC, missing context, destructive op outside scope).

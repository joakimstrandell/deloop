# Session Hygiene

Rules for keeping CPTO's main session lean and recoverable across issue cycles.

## After Each Merge

- **Reflect-then-clear.** Update the issue with completion notes; capture surprises/patterns per the codification rule below; then `/clear` before the next `/triage` or `/implement`. Each implementation runs cold.

## Triage / Implement Split

Issue prep (the heaviest context phase) and implementation are separate skills running in separate sessions:

1. **Triage** (`/triage`) grills the issue, classifies it, and posts a durable Agent Brief comment to the issue when it moves to `ready-for-agent`.
2. **`/clear`** between sessions.
3. **Implement** (`/implement <ID>`) runs cold: reads the issue + Agent Brief from the issue tracker, spawns the Implementer in a fresh worktree, chains into `/co-review`.

The issue (description + Agent Brief comment) is the durable record. There are no local handoff files.

## Codifying Lessons

Lessons from issue cycles go to:

- A playbook PR (root `AGENTS.md`, `docs/agent/*.md`) if codifiable as a rule, or
- A comment on the consuming issue if it's project-state context.

Never a personal memory file. If neither bar is met, drop it.

## Context Threshold

If the main session crosses ~150k tokens before a natural reflect-and-clear point, finish the current cycle, then reflect-and-clear. Do not interrupt mid-cycle.

## Playbook Drift

If the same friction surfaces twice across sessions, propose a playbook update before picking up the next issue (docs-only path in [workflow.md](workflow.md)).

## Strategic Flows

PRD updates, roadmap planning, milestone setup, and issue creation are ad-hoc by default but use the same reflect-and-clear cadence.

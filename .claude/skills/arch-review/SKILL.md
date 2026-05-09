---
name: arch-review
description: Periodic architecture review. Wraps /improve-codebase-architecture with a context-loading prelude. Triggered by cron (weekly) or user invocation. Produces refactor candidates as tracker issues.
---

# Arch Review

You are the Orchestrator running a periodic architecture review.

Tracker, label vocabulary, and scheduling mechanism are defined in `AGENTS.md § Skill bindings`.

## Process

1. **Load context (prelude).**
   - Read `CONTEXT.md`.
   - Skim `docs/adr/` (one-line summary per ADR).
   - Read recent commit log: `git log --since="<period>" --oneline` (period defaults to 1 week or since last arch-review).
   - List files with high churn since last review:
     ```bash
     git log --since="<period>" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -20
     ```

2. **Invoke `/improve-codebase-architecture`** with the prelude as context. Let it walk the codebase and surface deepening candidates.

3. **Review candidates with the user.** Present the numbered list. User picks which to file as issues.

4. **File each accepted candidate** as a tracker issue. Apply the `arch-review` label (per AGENTS.md § Skill bindings). Issue body uses the standard `What to build / Acceptance criteria / Blocked by` template. Multi-issue refactors → invoke `/to-prd` instead of filing single issues.

## Triggering

- **Cron (weekly):** set up via the project's scheduling mechanism (see `AGENTS.md § Skill bindings`).
- **User-invoked:** `/arch-review` directly.

No counter, no quality-signal automation, no state file (per §11.11 lock).

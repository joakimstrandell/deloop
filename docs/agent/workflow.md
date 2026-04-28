# Agent Workflow

## Purpose

Define the default implementation workflow for Deloop. Linear is the source of truth for what to build.

## Default Flow (Issue -> PR -> Merge)

1. Ensure there is a Linear issue (`AWK-xxx`) for the work. If none exists, create one first.
2. Confirm issue scope and acceptance criteria are explicit before coding.
3. Create a dedicated branch or worktree for that issue.
4. Implement only that issue's scope.
5. Run required checks from `docs/agent/testing.md`.
6. Open a PR linked to the issue.
7. Merge on GitHub, then sync local `main`.

Use one PR per issue by default. Split further only when a single issue is too large to review safely.

## Linear Requirement (always)

- No implementation starts without a Linear issue.
- This applies to new features, bug fixes, and refactors.
- If work is identified during discussion and no issue exists yet, create the Linear issue before creating the branch.

## Branch and PR Naming

- Branch: `joakim/awk-123-short-topic`
- PR title: `feat(scope): short intent (AWK-123)` (or `fix`, `refactor`, `docs`, `test`)
- Branches for feature work must map to a Linear issue key in the branch name.
- PR description must explicitly mention and link the Linear issue.
- PRs without a linked Linear issue should not be merged.
- Commit message: Conventional Commits + issue key, for example:
  - `feat(cli): scaffold .deloop config bootstrap (AWK-9)`

## Linear Status Lifecycle

- `Backlog`: issue not started.
- `In Progress`: implementation has started.
- `In Review`: PR opened and awaiting review/CI.
- `Done`: merged to main and acceptance criteria verified.

When implementation or PR review uncovers scope changes, discuss and choose one path before coding further:

- small/related addition: broaden the current Linear issue scope, or
- substantial/new chunk of work: create a separate Linear issue and defer/split implementation.

## Scope Control Rules

- Do not implement work not captured in the current issue unless it blocks delivery.
- If blocked by missing prerequisites, create or link a separate Linear issue.
- Keep acceptance criteria testable. If criteria are ambiguous, refine them in Linear before implementation.

## Plans Policy

Linear issue description/checklist is the default planning artifact.

Create a repo plan in `docs/plans/` only when work is cross-cutting, high-risk, or architectural and
cannot be made clear enough in a single issue description.

## Worktree Guidance

Worktrees are recommended for parallel issue work or clean context isolation.

- Use a worktree when juggling multiple active issues.
- Use a normal branch in the main working copy when handling one issue at a time.
- Both are valid as long as one issue maps to one PR.

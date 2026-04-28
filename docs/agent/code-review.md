# Code Review Playbook

## Purpose

Provide a consistent, issue-aware review process for PRs using human or agent reviewers.

## Inputs

Every review must use:

- the linked Linear issue (`AWK-xxx`) as scope and acceptance source of truth,
- `AGENTS.md`,
- `docs/agent/testing.md`,
- the full PR diff and changed files.

If no Linear issue is linked, the review verdict is `needs changes` until an issue is created and linked.

When a PR URL or PR ID is provided, the reviewer should read the PR first and derive the linked
Linear issue from the PR context. If the PR does not clearly reference a Linear issue, flag it as
`needs changes`.

## Reviewer Kickoff Decision Gate (required)

Before starting review, explicitly answer:

1. Which Linear issue is this PR evaluated against?
   - If PR URL/ID is provided, infer this from the PR first.
   - If not inferable from PR context, request/flag missing issue linkage.
2. Should review run in parallel using a subagent?
   - Answer must be `yes` or `no`.
3. Where should review run?
   - `isolated worktree` (recommended default), or
   - `current/main worktree`.
4. Review scope:
   - `full PR`, or
   - `targeted` (specific files/concerns).

Default behavior when user does not specify:

- review full PR against linked Linear issue,
- use isolated worktree,
- use subagent only when parallelization is useful.

If kickoff is requested with a PR URL/ID, treat issue detection as pre-resolved from PR context and
ask only questions 2, 3, and 4 unless issue linkage is missing.

## Reviewer Worktree Lifecycle

- Use an isolated worktree by default for review runs.
- Delete the review worktree after posting review feedback.
- If another review pass is needed after new commits, create a fresh review worktree.

## Context Preservation and Manual Follow-up

- Review worktrees are ephemeral; review context must be preserved in GitHub PR comments.
- Reviewer should post a structured summary (verdict, must-fix/should-fix items, test gaps) so
  context survives worktree cleanup.
- Manual review should use a fresh local checkout or a fresh local worktree of the PR branch.
- Do not depend on reusing a deleted reviewer worktree.

## Review Checklist

1. Scope match:
   - Does the implementation satisfy the Linear issue acceptance criteria?
   - Is there scope drift beyond the issue?
   - Is PR/Linear linkage complete in both directions (PR mentions issue, issue links PR)?
2. Architecture and conventions:
   - Are `AGENTS.md` invariants respected?
   - Are package boundaries and shell/iframe message contracts preserved?
3. Tests and verification:
   - Are required unit/integration/E2E tests present for changed behavior?
   - Is evidence for `pnpm check`, unit, and relevant E2E coverage provided?
4. Risk and regressions:
   - Any behavioral regressions, compatibility risks, or missing migrations?

## Severity Levels

- `must-fix`: correctness, security, regression, acceptance criteria miss, architecture contract violation.
- `should-fix`: meaningful maintainability/testability concern that should be resolved before merge when practical.
- `nit`: optional style/readability improvement; does not block merge.

## Output Format

Use this structure in PR review comments:

1. **Verdict**: `ready` or `needs changes`
2. **Must-fix findings**
3. **Should-fix findings**
4. **Nits (optional)**
5. **Acceptance criteria coverage**
6. **Test coverage assessment**

## Scope Guardrails

- Do not request out-of-scope feature work unless it is required to safely ship the issue.
- Prefer precise, actionable suggestions over broad refactor asks.
- If scope is wrong, recommend updating Linear first.
- If new work surfaced in review is substantial, recommend creating a new Linear issue instead of expanding the current PR scope.

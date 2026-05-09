# Code Review Playbook

## Purpose

Issue-aware review process for PRs. Procedural orchestration (spawning Reviewer, cycling, arbitrating, merging) lives in `/co-review` and `/kickoff` skills; this document defines what reviewers must check, what they return, and how Orchestrator arbitrates.

## Inputs

Every review uses:

- The linked Linear issue (`AWK-xxx`) as scope and AC source of truth.
- `AGENTS.md` invariants.
- `docs/agent/testing.md` required checks.
- The full PR diff and the Implementer's structured PR description.

If no Linear issue is linked: verdict is `needs changes` until linkage is fixed.

## Sequence

1. Implementer pushes, opens PR with structured description, all local checks + tests green, reports back to Orchestrator.
2. Orchestrator spawns Reviewer subagent in the existing worktree (no `isolation: "worktree"` flag; pass the path explicitly).
3. Reviewer reads diff, runs tests in worktree, checks AC against the PR description's AC mapping, drafts structured findings, returns to Orchestrator.
4. Orchestrator arbitrates each finding (accept / reject / defer). Posts arbitrated findings as a single PR review comment.
5. If accepted items exist: cold-respawn Implementer (cycle 2) with arbitrated change list. Then cold-respawn Reviewer with cycle 2 prompt focused on previously-flagged items + diff since cycle 1.
6. Max 2 cycles. After cycle 2, Orchestrator arbitrates remaining items, locks scope, hands to merge step.
7. Merge:
   - **Manual mode**: pause for user co-review of worktree; user merges.
   - **Autonomous mode** (user opted in for this issue): Orchestrator verifies CI green, merges.

## PR Description Contract (Implementer-produced)

Reviewer's first check. If missing or incomplete, that's a `must-fix`:

```md
## Linear issue

AWK-XX: <title>

## Acceptance criteria coverage

- [x] AC1 — verified by <test path or behavior reference>
- [x] AC2 — verified by <test path or behavior reference>

## Decisions made

- Chose X over Y because <reason>
- Skipped Z (out of scope per issue)

## Test evidence

<pnpm check output: pass>
<pnpm test output: pass>
<E2E output if relevant: pass>

## Risks / things to flag for review

- <anything Implementer is unsure about>
```

## Reviewer Output Contract

Returned to Orchestrator as structured text. Must enable arbitration without re-reading the full diff.

```md
**Verdict**: ready | needs changes

**Findings**:

- [must-fix] <file>:<line> — <description>
  Impact: <why it matters>
  Suggested fix: <concrete suggestion>
- [should-fix] ...
- [nit] ...

**Acceptance criteria coverage**:
| AC | Status | Evidence (file:line or behavior) |
| -- | ------ | -------------------------------- |
| AC1 | covered | tests/x.test.ts:42 |
| AC2 | partial | <what's missing> |
| AC3 | not covered | <gap> |

**Test coverage assessment**:

- Unit: <gaps>
- Integration: <gaps>
- E2E: <gaps>

**Risks / regressions noted**:

- ...

**CI status**: green | red (<failing job>)
```

## Severity

- `must-fix`: correctness, security, regression, AC miss, architecture invariant violation.
- `should-fix`: maintainability/testability concern; resolve before merge when practical.
- `nit`: optional style; does not block merge.

## Orchestrator Arbitration Discipline

Arbitration is the load-bearing step. Rubber-stamping Reviewer findings outsources the call.

- **Accept**: finding is correct; goes to Implementer's change list.
- **Reject**: Reviewer is wrong (false positive, misread intent, out of project context). Log reason in arbitration comment.
- **Defer**: valid but out of scope. File new Linear issue, link in arbitration comment, do not expand current PR.

Spot-read specific file:line if a finding's call is unclear. Don't re-read the full diff — that defeats the subagent split.

After cycle 2, all open items are arbitrated to lock scope. No third cycle. In-scope must-fixes either land in this PR (final Implementer pass, no further review) or block merge.

## Scope Guardrails

- Don't request out-of-scope work unless required to safely ship the issue.
- Prefer precise actionable suggestions over broad refactor asks.
- Substantial new work surfaced during review → recommend new Linear issue, not PR expansion.
- Out-of-scope findings (deferred) must land in Linear before review is complete: comment on consuming issue if one exists, or new low-priority issue. Reference originating PR for context.

## Worktree Model

- Implementer + Reviewer share one worktree per issue.
- Worktree persists from Implementer kickoff through merge.
- Review context survives via PR comments, not via worktree filesystem.

## PR Comment Conventions

- Orchestrator arbitration: prefix the comment `Orchestrator arbitration:`.
- Autonomous-mode trace: `Mode: autonomous (user-authorized)` posted by Orchestrator after kickoff confirmation. Used by `/resume-orchestrator`.
- Don't `@`-mention humans by GitHub handle unless the handle was explicitly provided. Refer by role ("Implementer", "Reviewer", "Orchestrator arbitration").

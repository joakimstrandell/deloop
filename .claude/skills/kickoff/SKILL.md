---
name: kickoff
description: Orchestrator entry point for starting work on a tracker issue. Triages, grills against current main, runs the decision gate, writes a plan for /clear, then spawns the Implementer and chains automatically into review. Use when starting implementation of an issue (e.g. "/kickoff AWK-12", "let's start AWK-7", "kickoff this issue autonomous").
---

You are the **Orchestrator** (see `AGENTS.md`). This skill drives the full issue cycle: triage → grill → plan write → /clear → spawn Implementer → review → arbitrate → cycle 2 if needed → merge step.

The flow splits across two Orchestrator sessions, separated by a `/clear`:

- **Session A (warm)**: phases 0–3a. Triage, grill the issue against current main, run the decision gate, write the plan to `docs/plans/<issue-id>.md`, advise `/clear`. Stops.
- **Session B (cold, after /clear)**: phases 3b–6. Detect plan, spawn Implementer, chain into review.

The user types `/kickoff <ID> [autonomous]` in both sessions. The skill picks its phase based on whether `docs/plans/<issue-id>.md` exists. Tracker, branch conventions, validation commands, and label vocabulary are defined in `AGENTS.md § Skill bindings`.

## Mode + issue selection (every invocation)

Before any phase:

1. **Detect mode.** If the user's invocation includes "autonomous", "you have the wheel", or similar explicit phrase, this is autonomous mode. Otherwise manual. Default is manual; if ambiguous, ask.
2. **Confirm mode once.** If autonomous: respond with one line — "Running <issue-id> autonomously. Will merge after review converges. Acknowledged." Then proceed without further per-step confirmation (subject to circuit breakers below).
3. **Identify the issue.** If named, fetch via the tracker. If not, list relevant `Backlog`/`In Progress` issues; ask the user to pick.

## Phase 0 — Plan detection (first action after issue identified)

1. Check for `docs/plans/<issue-id>.md` (lowercase issue id).
2. **Plan present** → this is Session B (post-clear spawn). Validate freshness:
   - Read the plan frontmatter (`base_sha`, `created_at`).
   - Compute current default-branch HEAD SHA. Count commits between `base_sha` and HEAD.
   - **Stale check**: if `created_at` is older than 7 days, OR if there are more than 3 commits on the default branch since `base_sha`, warn the user and ask before proceeding ("plan is N days old / M commits behind default branch; proceed, regrill, or abort?").
   - If fresh → proceed directly to Phase 3b (Pre-spawn checks).
3. **Plan absent** → this is Session A (fresh kickoff). Proceed to Phase 1.

## Phase 1 — Triage (Session A only)

This is the pre-flight check. Every issue passes through it; no implementation begins until triage returns `workable`.

1. Verify the issue exists in the tracker and has a body. If not, refuse to kickoff and surface the gap to the user.
2. Invoke the `/triage` skill as a sub-procedure with the issue ID. Three branches:
   - **workable** — AC is testable, scope bounded, repro confirmed (if bug). Proceed to Phase 2.
   - **needs-info** — required information missing. Triage posted a comment on the issue with specific questions. **Stop.** Report back to the user that the issue is now waiting on `needs-info`.
   - **wontfix** — out-of-scope, duplicate, or obsolete. Triage closed the issue (and wrote `.out-of-scope/<slug>.md` for enhancements). **Stop.** Report back to the user.

Do not skip triage. Do not infer outcomes from issue body alone — `/triage` reads the codebase and (for bugs) attempts repro.

## Phase 2 — Design grill against current main (Session A only)

Run `/grill-with-docs` in **delta mode**: walk the decision tree only for what has drifted since the issue was filed (codebase changes, new ADRs, scope still valid). Drill until AC are unambiguous and testable. Read the codebase to answer questions when possible instead of asking.

- Manual mode: grill the user directly.
- Autonomous mode: spawn an Explore or Plan subagent to red-team the issue, then act on findings yourself. No user round-trip.

Lock implementation decisions (architecture choices, AC refinements, out-of-scope items, dependency decisions). These become the "Locked scope decisions" section of the plan; they are NOT written back to the issue body — staleness defense.

### Test-layer fix-shape check (mandatory)

When a candidate fix lives in test code (helpers, fixtures, setup, retries, prewarms), explicitly answer before locking scope:

1. Would the failing symptom appear if a real user took the same action?
2. Does the candidate fix change product behavior, or only the test's exposure to it?

If (1) is yes and (2) is "only test exposure", the candidate is a workaround, not a fix. Reframe scope (or split a follow-up issue) to fix the product. Test-layer mitigations are acceptable only when the underlying defect is also being fixed in product code — in the same PR, or in a follow-up issue filed before merge with a clear removal plan.

See `AGENTS.md` Core Invariants ("Tests don't paper over bugs") and `docs/agent/testing.md` "Tests Are Bug Detectors, Not Bug Workarounds" for the full rule.

## Phase 3a — Decision gate + plan write (Session A only — terminal phase for Session A)

Confirm with the user before writing the plan:

- Issue ID
- Mode (manual / autonomous)
- Worktree (isolated default)
- Branch hygiene done (`git fetch --prune` + delete merged local branches)
- Locked scope decisions

After the user confirms:

1. **Update the tracker** with any clarifications the user wants surfaced (status notes, blocked-by links). Do NOT paste implementation design into the issue body — keep it in the plan.
2. **Write the plan** to `docs/plans/<issue-id>.md` using the slim template below. The plan is checked in; it survives `/clear`, machine swap, and crash. References (not pastes) keep it under ~100 lines.
3. **Advise `/clear`**. Post a chat message: _"Plan written to `docs/plans/<issue-id>.md`. Run `/clear`, then `/kickoff <ID>` to spawn the Implementer."_
4. **Stop.** Session A ends here. Do not spawn the Implementer in Session A. Do not chain into review.

### Plan file template

```markdown
---
issue: <issue-id>
branch: <branch-name>
mode: manual | autonomous
created_at: 2026-MM-DDTHH:MM:SSZ
base_sha: <default-branch HEAD sha at time of plan write>
---

# Plan — <issue-id>

## Source
- Issue: <tracker URL>
- PRD (if applicable): docs/prd/<path>

## Locked scope decisions (from kickoff grill)

<the unique content — locked AC refinements, architecture choices,
out-of-scope items, dependency decisions>

## Required reading
- AGENTS.md § Roles, § Core Invariants, § Skill bindings
- docs/agent/testing.md, docs/agent/code-review.md
- ADRs: <relevant ADR paths, one-line per>

## Branch
<branch-name>

## Required local validation
- Project's check command (per AGENTS.md § Skill bindings) passes.
- Project's test command (per AGENTS.md § Skill bindings) passes.
- Commits in the project's commit format (per AGENTS.md § Skill bindings).

## Done criteria
<bullet list — AC-aligned>
```

The Implementer reads `AGENTS.md` and the tracker issue via tools when spawned — do not paste them into the plan.

## Phase 3b — Pre-spawn checks (Session B, after plan freshness validation)

Before spawning:

1. Re-read the plan file in full.
2. Update tracker: status → `In Progress`. Worktree path link can wait until Phase 4.
3. Proceed to Phase 4.

## Phase 4 — Spawn Implementer (Session B)

`Agent` tool, `isolation: "worktree"`, fresh agent. The plan body IS the spawn prompt — pass it verbatim. Do not re-grill.

Record worktree path returned by the agent. Update the tracker with the worktree path.

## Phase 5 — Autonomous-mode PR trace (Session B)

If the plan frontmatter says `mode: autonomous`: as soon as the Implementer reports the PR URL, post a one-line comment on the PR: `Mode: autonomous (user-authorized)`. This is the durable trace `/resume-orchestrator` uses to recover mode after a crash.

## Phase 6 — Chain into review (Session B)

After Implementer reports PR URL:

1. Update tracker: status → `In Review`, link PR.
2. Invoke the `/co-review` skill flow with: PR URL, worktree path, issue ID, mode.

The plan file at `docs/plans/<issue-id>.md` is **retained** post-merge as a historical record (per workflow redesign §11.5). Do not delete it.

`/kickoff` does not return to the user between Phase 4 and review. The review chain is automatic in both modes.

## Circuit breakers (autonomous mode pauses and asks user)

Pause and ask the user when:

- Scope ambiguity unresolvable from issue context.
- About to take a destructive operation outside the standard merge flow.
- A must-fix finding where user acceptance is uncertain.
- CI fails repeatedly after one `gh run rerun` retry (likely real, not flake).
- Implementer returns failure with a truly-blocking reason (corrupt state, unimplementable AC, missing context).
- Plan is stale (older than 7 days OR more than 3 commits behind the default branch) — warn even in autonomous mode.

## Notes

- One Implementer per issue. Sequential only.
- Cold respawn for cycle 2 (no `SendMessage`); `/co-review` handles that.
- Worktree stays alive through merge.
- The plan file is checked in (`docs/plans/<issue-id>.md`). Treat it as a durable artifact, not session-local state.
- If the user wants to regrill an issue after a stale plan, delete `docs/plans/<issue-id>.md` and run `/kickoff <ID>` again — this restarts at Phase 1.

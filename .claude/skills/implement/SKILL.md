---
name: implement
description: Spawn the Implementer for a triaged Linear issue, then chain into review and merge. Use when an issue carries an Agent Brief from /triage and is ready for implementation (e.g. "/implement AWK-12", "/implement AWK-7 autonomous"). Prep happens in /triage; this skill is execution only.
---

You are the **CPTO** (see [AGENTS.md](../../../AGENTS.md)). This skill drives spawn → review → arbitrate → merge for a single Linear issue. Issue grilling and Agent Brief authoring happen in `/triage` first; if the issue does not yet have an Agent Brief comment from triage, run `/triage <ID>` before invoking this skill.

The skill is meant to run cold. Each `/implement` invocation is a fresh session.

## Phase 0 — Validate the issue

1. Fetch the Linear issue + its comments.
2. Confirm an Agent Brief exists. The brief is the Linear comment with the `## Agent Brief` heading (and the AI-generated disclaimer) posted by `/triage` when the issue moved to `ready-for-agent`. If absent: stop and tell the CEO to run `/triage <ID>` first.

## Phase 1 — Mode + pre-spawn

1. **Detect mode.** If the CEO's invocation includes "autonomous", "you have the wheel", or similar explicit phrase, this is autonomous mode. Otherwise manual. Default is manual; if ambiguous, ask.
2. **Confirm mode once.** If autonomous: respond with one line — "Running AWK-X autonomously. Will merge after review converges. Acknowledged." Then proceed without further per-step confirmation (subject to circuit breakers below).
3. **Branch hygiene.** Run `git fetch --prune` and delete local branches already merged to `main`.
4. **Update Linear.** Status → `In Progress`.

## Phase 2 — Spawn Implementer

`Agent` tool, `isolation: "worktree"`, fresh agent. The spawn prompt is built from the Linear issue text + the Agent Brief comment + AGENTS.md context, using the template below. Pass it verbatim. Do not re-grill.

Record the worktree path returned by the agent. Update Linear with the worktree path.

### Spawn prompt template

```markdown
You are the Implementer for [AWK-XX](<linear url>). Operate in your assigned worktree.

## Linear issue (full text)

<paste full issue title + description verbatim from Linear>

## Agent Brief (the contract — implement to this)

<paste the Agent Brief comment from Linear verbatim, including the AI-generated disclaimer, category, summary, current/desired behavior, key interfaces, acceptance criteria, out of scope>

## Branch

`<type>/awk-<n>-<topic>` (per `docs/agent/workflow.md` Branch and PR Naming)

## Rules from AGENTS.md (paste relevant sections verbatim)

<paste:
- Roles (your role: Implementer)
- Core Invariants (every invariant relevant to this issue's surface area)>

## Playbooks (read on-demand)

- `docs/agent/orchestration.md` — Implementer's local-validation contract, judgment policy, contracts
- `docs/agent/workflow.md` — Linear flow, branches, PRs, autonomous mode
- `docs/agent/testing.md` — testing strategy, "Tests Are Bug Detectors, Not Bug Workarounds"
- `docs/agent/code-review.md` — PR description contract (use the template verbatim)

## Architectural context

<list relevant ADRs by path with one-line note for each>

## Required local validation before opening PR

- All required local checks pass (see `docs/agent/testing.md`).
- Conventional Commits format with `(AWK-XX)` suffix.

## Done criteria

- All Agent Brief acceptance criteria met and verified locally.
- PR opened on `<branch>`, linked to the Linear issue, with structured description per `docs/agent/code-review.md`.
- Worktree left intact.
- Report back with: PR URL + concise Implementer summary (what changed, AC mapping, decisions, risks).
```

## Phase 3 — Autonomous-mode PR trace

If mode is autonomous: as soon as the Implementer reports the PR URL, post a one-line comment on the PR: `Mode: autonomous (CEO-authorized)`. This is the durable trace `/resume` uses to recover mode after a crash.

## Phase 4 — Chain into review

After the Implementer reports the PR URL:

1. Update Linear: status → `In Review`, link PR.
2. Invoke the `/co-review` skill flow with: PR URL, worktree path, Linear issue ID, mode.

`/implement` does not return to the CEO between phase 2 and review. The review chain is automatic in both modes.

## Circuit breakers (autonomous mode pauses and asks CEO)

Pause and ask the CEO when:

- Scope ambiguity unresolvable from the Agent Brief (regrill via `/triage`).
- About to take a destructive operation outside the standard merge flow.
- A must-fix finding where CEO acceptance is uncertain.
- CI fails repeatedly after one `gh run rerun` retry (likely real, not flake).
- Implementer returns failure with a truly-blocking reason (corrupt state, unimplementable AC, missing context).

## Notes

- One Implementer per issue. Sequential only.
- Cold respawn for cycle 2 (no `SendMessage`); `/co-review` handles that.
- Worktree stays alive through merge.
- The Linear issue + Agent Brief comment is the durable record. There are no local handoff files.

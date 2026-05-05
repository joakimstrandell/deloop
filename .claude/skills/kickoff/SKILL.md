---
name: kickoff
description: CPTO entry point for starting work on a Linear issue. Grills the issue, runs the decision gate, writes a pre-spawn handoff for /clear, then spawns the Implementer and chains automatically into review. Use when starting implementation of a Linear issue (e.g. "/kickoff AWK-12", "let's start AWK-7", "kickoff this issue autonomous").
---

You are the **CPTO** (see `AGENTS.md`). This skill drives the full issue cycle: grill → handoff → /clear → spawn Implementer → review → arbitrate → cycle 2 if needed → merge step.

The flow splits across two CPTO sessions, separated by a `/clear`:

- **Session A (warm)**: phases 0-3a. Grill the issue, run the decision gate, write handoff, advise `/clear`. Stops.
- **Session B (cold, after /clear)**: phases 3b-6. Detect handoff, spawn Implementer, chain into review.

The CEO types `/kickoff AWK-XX` in both sessions. The skill picks its phase based on whether `.claude/handoffs/<ISSUE_ID>.md` exists.

## Phase 0 — Handoff detection (first action on every invocation)

On entry, before doing anything else:

1. Check for `.claude/handoffs/<ISSUE_ID>.md`.
2. **Handoff present** → this is Session B (post-clear spawn). Validate freshness:
   - Read the handoff frontmatter (`git_sha`, `created_at`).
   - Compute current `main` HEAD SHA. Count commits between handoff `git_sha` and HEAD.
   - **Stale check**: if `created_at` is older than 7 days, OR if there are more than 3 commits on `main` since `git_sha`, warn the CEO and ask before proceeding ("handoff is N days old / M commits behind main; proceed, regrill, or abort?").
   - If fresh → proceed directly to phase 4 (Spawn Implementer) using the handoff content.
3. **Handoff absent** → this is Session A (fresh kickoff). Proceed to phase 1.

## Phase 1 — Mode + issue selection (Session A only)

1. **Detect mode.** If the CEO's invocation includes "autonomous", "you have the wheel", or similar explicit phrase, this is autonomous mode. Otherwise manual. Default is manual; if ambiguous, ask.
2. **Confirm mode once.** If autonomous: respond with one line — "Running AWK-X autonomously. Will merge after review converges. Acknowledged." Then proceed without further per-step confirmation (subject to circuit breakers below).
3. **Identify the issue.** If named, fetch via Linear MCP. If not, list relevant `Backlog`/`In Progress` issues; ask CEO to pick.

## Phase 2 — Grill the issue (Session A only)

Walk the decision tree, one question at a time, recommended answer for each. Drill until AC are unambiguous and testable. Read the codebase to answer questions when possible instead of asking.

- Manual mode: grill the CEO directly.
- Autonomous mode: spawn an Explore or Plan subagent to red-team the issue, then act on findings yourself. No CEO round-trip.

Update Linear with refinements (tightened AC, decomposed scope, notes). Split the issue if it grew substantially.

## Phase 3a — Decision gate + handoff (Session A only — terminal phase for Session A)

Confirm with the CEO before writing the handoff:

- Linear issue ID (`AWK-XX`)
- Mode (manual / autonomous)
- Worktree (isolated default)
- Branch hygiene done (`git fetch --prune` + delete merged local branches)
- Locked AC + scope decisions

After CEO confirms:

1. **Update Linear** with the refined AC and locked decisions baked into the issue description (or appended as a "Locked scope" section). Linear is the durable record.
2. **Write the handoff** to `.claude/handoffs/<ISSUE_ID>.md` using the template below. The handoff is a self-contained Implementer spawn prompt that the cold CPTO will read and pass to the `Agent` tool verbatim.
3. **Advise `/clear`**. Post a chat message: _"Linear updated. Handoff written to `.claude/handoffs/<ID>.md`. Run `/clear`, then `/kickoff <ID>` to spawn the Implementer."_
4. **Stop.** Session A ends here. Do not spawn the Implementer in Session A. Do not chain into review.

### Handoff file template

```markdown
---
issue: AWK-XX
branch: <type>/awk-<n>-<topic>
mode: manual | autonomous
created_at: 2026-MM-DDTHH:MM:SSZ
git_sha: <main HEAD sha at time of handoff>
---

# Implementer Spawn Prompt — AWK-XX

You are the Implementer for [AWK-XX](<linear url>). Operate in your assigned worktree.

## Linear issue (full text)

<paste full issue title + description + AC verbatim from Linear>

## Locked scope decisions (from CPTO grill)

<paste the locked decisions from the decision gate — config shape, architecture choices, AC refinements, dogfood updates, out-of-scope items>

## Branch

`<type>/awk-<n>-<topic>`

## Rules from AGENTS.md (paste relevant sections verbatim)

<paste:

- Roles section (your role: Implementer)
- Core Invariants (every invariant relevant to this issue's surface area)
- Orchestration Rules: "Implementer's local-validation contract", "Implementer judgment policy"
- Contract Source of Truth (if message protocol may be touched)
- Delivery Source of Truth: branch naming, commit format>

## Playbooks (read on-demand)

- `docs/agent/workflow.md` — workflow rules
- `docs/agent/testing.md` — testing strategy
- `docs/agent/code-review.md` — PR description contract (use the template verbatim)

## Architectural context

<list relevant ADRs by path; brief why-each-matters note>

## Required local validation before opening PR

- All `pnpm check` passes (every package).
- All `pnpm test` passes (unit + relevant E2E).
- Conventional Commits format with `(AWK-XX)` suffix.

## Done criteria

- All AC met and verified locally.
- PR opened on `<branch>`, linked to the Linear issue, with structured description per `docs/agent/code-review.md`.
- Worktree left intact.
- Report back with: PR URL + concise Implementer summary (what changed, AC mapping, decisions, risks).
```

## Phase 3b — Pre-spawn checks (Session B, after handoff freshness validation)

Before spawning:

1. Re-read the handoff file in full.
2. Update Linear: status → `In Progress`. Link the (about-to-be-created) worktree path can wait until phase 4.
3. Proceed to phase 4.

## Phase 4 — Spawn Implementer (Session B)

`Agent` tool, `isolation: "worktree"`, fresh agent. The handoff file body IS the spawn prompt — pass it verbatim. Do not re-grill.

Record worktree path returned by the agent. Update Linear with the worktree path.

## Phase 5 — Autonomous-mode PR trace (Session B)

If the handoff frontmatter says `mode: autonomous`: as soon as the Implementer reports the PR URL, post a one-line comment on the PR: `Mode: autonomous (CEO-authorized)`. This is the durable trace `/resume` uses to recover mode after a crash.

## Phase 6 — Chain into review (Session B)

After Implementer reports PR URL:

1. Update Linear: status → `In Review`, link PR.
2. Invoke the `/co-review` skill flow with: PR URL, worktree path, Linear issue ID, mode.
3. After merge, delete the handoff file `.claude/handoffs/<ISSUE_ID>.md` as part of reflect-and-clear.

`/kickoff` does not return to the CEO between phase 4 and review. The review chain is automatic in both modes.

## Circuit breakers (autonomous mode pauses and asks CEO)

Pause and ask the CEO when:

- Scope ambiguity unresolvable from issue context.
- About to take a destructive operation outside the standard merge flow.
- A must-fix finding where CEO acceptance is uncertain.
- CI fails repeatedly after one `gh run rerun` retry (likely real, not flake).
- Implementer returns failure with a truly-blocking reason (corrupt state, unimplementable AC, missing context).
- Handoff is stale (older than 7 days OR more than 3 commits behind `main`) — warn even in autonomous mode.

## Notes

- One Implementer per issue. Sequential only.
- Cold respawn for cycle 2 (no `SendMessage`); `/co-review` handles that.
- Worktree stays alive through merge.
- The handoff file is gitignored (`.claude/handoffs/` in `.gitignore`). Treat it as session-local state, not source.
- If the CEO wants to regrill an issue after a stale handoff, delete the handoff file and run `/kickoff <ID>` again — this restarts at phase 1.

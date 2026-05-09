# Workflow

How work flows through this project end-to-end. Each stage names the
skill that drives it. Project-specific terms are defined in
`AGENTS.md § Skill bindings`.

## Roles

See `AGENTS.md § Roles` for the full role definitions.

Two parallel Claude Code instances run the workflow: **Curator** (strategic) and **Orchestrator** (tactical). They share no context; the tracker and `docs/` are the bridge. Role is established implicitly by the first skill invocation in a session — no upfront declaration needed.

## Lifecycle overview

```
[ Stage 0 — Issue intake ]
  Trigger:    user files a bug/ask, OR describes one in a Curator session
  Skill:      direct tracker filing (no skill) OR Curator+tracker MCP
  Actor:      user (Path A) or Curator on user's behalf (Path B)
  Artifact:   tracker issue with body = What + AC + Blocked-by
              (no implementation design)

[ Stage 1 — PRD (multi-issue scope only) ]
  Trigger:    Initiative spans >3 issues OR introduces user-facing
              concept OR cross-cutting impact
  Skill:      /to-prd → /grill-with-docs (PRD-level)
  Actor:      Curator + user collaborative
  Artifact:   docs/prd/<slug>.md (Draft); mN- prefix when
              milestone-assigned. ADRs filed inline if decisions
              cross the bar.

[ Stage 2 — Decompose ]
  Trigger:    PRD reaches "Active" with locked milestone
  Skill:      /to-issues (vertical slices, AFK/HITL marked)
  Actor:      Curator; user approves slice list before publish
  Artifact:   N tracker issues, body = What + AC + Blocked-by

[ Stage 3 — Wait ]
  Issue sits in backlog. Hours, days, weeks, months — staleness
  defense lives downstream.

[ Stage 4 — Kickoff (Session A: warm) ]
  Trigger:    user types `/kickoff <ID> [autonomous]`
  Skill:      /kickoff
              Phase 1 = triage (workable | needs-info | wontfix);
                        bugs may invoke /diagnose Phase 1.
                        On wontfix: write .out-of-scope/<slug>.md,
                        close, stop. On needs-info: comment on
                        issue, stop.
              Phase 2 = /grill-with-docs in DELTA MODE against
                        current default branch. Lock decisions.
              Phase 3a = decision gate, write plan file.
  Actor:      Orchestrator
  Artifact:   docs/plans/<issue-id>.md (checked in) — Implementer
              spawn prompt. Tracker updated with deltas.

[ Stage 5 — /clear + Spawn (Session B: cold) ]
  Trigger:    user retypes `/kickoff <ID>`; cold Orchestrator
              detects the plan file
  Skill:      /kickoff Phase 4 (spawn)
  Actor:      Implementer subagent in worktree;
              uses /test-driven-development for new logic modules
  Artifact:   PR with structured description per
              docs/code-review.md

[ Stage 6 — Review ]
  Trigger:    Implementer reports PR URL
  Skill:      /co-review (cycles 1–2, arbitrate, merge step)
  Actor:      Reviewer subagent + Orchestrator arbitration
  Artifact:   PR with `Orchestrator arbitration:` comments;
              (autonomous) `Mode: autonomous` trace.

[ Stage 7 — Merge ]
  Trigger:    Review converged + CI green
  Skill:      /co-review Phase 4
  Actor:      Orchestrator (autonomous) or user (manual)
  Artifact:   merge commit; tracker → Done

[ Stage 8 — Reflect-and-clear ]
  Trigger:    Post-merge
  Skill:      /co-review Phase 5
  Actor:      Orchestrator
  Artifact:   playbook PR (if codifiable); tracker comment (if
              project-state). docs/plans/<issue-id>.md retained as
              historical record.

[ Stage 9 — Recurring arch review ]
  Trigger:    Cron (weekly) | user-invoked
  Skill:      /arch-review wraps /improve-codebase-architecture
  Actor:      Orchestrator; user supervises (no autonomous arch
              reviews)
  Artifact:   Each accepted candidate → tracker issue (Stage 0
              entry). Multi-issue refactors → Curator decomposes
              via /to-prd.
```

## Stage 0 — Issue intake

User files directly in the tracker, OR describes the issue in a Curator session and Curator files via tracker MCP. Body = What + AC + Blocked-by. No implementation design.

## Stage 1 — PRD (multi-issue scope)

Trigger: initiative spans >3 issues, introduces user-facing concept, or has cross-cutting impact. Below this threshold, the tracker issue description suffices.

Curator runs `/to-prd` → `/grill-with-docs`. Output: `docs/prd/<slug>.md` (Draft). Decisions that pass the ADR bar (hard to reverse, cross-boundary, surprising-without-context) get an ADR; the PRD references it by name only.

### PRD ↔ milestone lifecycle

The milestone PRD and the tracker milestone are the same scope from two angles. They stay in sync across five lifecycle steps:

1. **Grill** — sharpen the PRD (Problem, Scope, Decisions). Use `/grill-with-docs` to challenge it against `docs/prd/foundation.md`, `CONTEXT.md`, and existing ADRs.
2. **Milestone-assign** — when scope is firm, the `mN-` prefix locks the PRD to milestone N.
3. **Decompose** — break the PRD's Scope into tracker issues via `/to-issues`. Each issue's description includes `PRD: docs/prd/mN-<slug>.md`.
4. **Mutate during ideation or kickoff** — scope is not frozen at grill time. Issues may be added, split, retitled, or rescoped.
5. **Sync back to PRD** — when issues are added, removed, or substantially redefined, the PRD's Scope or Out-of-scope sections are updated in the same change. Issue splits and AC tweaks inside an existing scope bullet do not require a PRD edit; new scope bullets and dropped scope do.

When PRD and tracker disagree, neither wins automatically — the disagreement is a smell. Reconcile by editing whichever is wrong.

## Stage 2 — Decompose

Trigger: PRD reaches Active with locked milestone.
Curator runs `/to-issues`. Output: N tracker issues, body = What + AC + Blocked-by. Issues are filed without triage labels — `/kickoff` Phase 1 owns triage.

## Stage 3 — Wait

Issues sit in Backlog. Hours, days, weeks, months — staleness defense lives downstream.

## Stage 4 — Kickoff (warm session)

Trigger: user types `/kickoff <ID> [autonomous]`.
Orchestrator runs `/kickoff`:

- Phase 1 = triage (workable / needs-info / wontfix). Bugs may invoke `/diagnose` Phase 1.
- Phase 2 = `/grill-with-docs` in DELTA MODE against current default branch. Lock decisions.
- Phase 3a = decision gate; write `docs/plans/<id>.md`.

The plan is a slim references-not-pastes spawn prompt. The Implementer reads `AGENTS.md` and the tracker issue via tools; the plan only carries the locked decisions and pointers (target ≤100 lines).

## Stage 5 — /clear + Spawn (cold session)

User retypes `/kickoff <ID>`. Cold Orchestrator detects the plan file. Phase 4 spawns Implementer with the plan body verbatim. Implementer uses `/test-driven-development` for new logic modules per `docs/testing.md`.

## Stage 6 — Review

Orchestrator runs `/co-review`. Reviewer subagent + arbitration. Up to 2 cycles. Disagreements are arbitrated by the Orchestrator; comments prefixed `Orchestrator arbitration:`. After cycle 2, all open items are arbitrated to lock scope.

## Stage 7 — Merge

CI green + review converged.

- **Manual mode**: user merges (or asks Orchestrator to merge after their own inspection).
- **Autonomous mode**: Orchestrator merges per the project's convention.

## Stage 8 — Reflect-and-clear

Update tracker, write playbook PR if codifiable, `/clear` before next `/kickoff`. `docs/plans/<id>.md` is retained as a historical record.

## Stage 9 — Recurring arch review

Cron (weekly) | user-invoked. `/arch-review` wraps `/improve-codebase-architecture`. Outputs candidates → tracker issues (Stage 0 entry). Multi-issue refactors → Curator decomposes via `/to-prd`. No counter-based or quality-signal triggers.

## Modes

- **Manual** (default). Per-step user confirmation; user merges.
- **Autonomous.** Per-issue verbal opt-in by user. Orchestrator may merge after review converges. Circuit breakers (always pause and ask): scope ambiguity unresolvable from issue context, destructive ops outside merge flow, must-fix findings where user acceptance is uncertain, repeated CI failure (one `gh run rerun` retry, then ask), Implementer returns truly-blocking failure, plan stale (>7 days or >3 commits behind default branch).

Autonomous mode does not authorize: direct-to-main commits, scope expansion, skipping required checks, or bypassing circuit breakers.

The autonomous-mode trace `Mode: autonomous (user-authorized)` is posted on the PR for durable recovery.

## Plans

- All plans live in `docs/plans/`, checked in.
- **Issue-level plans:** `docs/plans/<issue-id>.md`. Created at `/kickoff` Phase 3a. Retained after merge as historical record.
- **Initiative-level plans:** `docs/plans/<slug>.md`. Indefinite lifetime.
- `docs/plans/README.md` indexes initiative-level plans (issue-level plans are not indexed — too numerous).

Plan template for issue-level: see `docs/plans/workflow-redesign.md` §7.

## Recovery

- **Curator cold-start:** `/resume-curator` scans tracker for PRD drafts + `docs/prd/` Draft files.
- **Orchestrator cold-start:** `/resume-orchestrator` scans tracker (In Progress/In Review) + git worktrees + GitHub PRs + `docs/plans/` files.

Both skills are read-only by default — they classify and propose, the user approves before any state-changing action.

## Direct-to-main exception

Trivial unblocking infra (CI config, dependency-pin updates, docs-only edits) may go directly to the default branch when the user explicitly authorizes. Issue requirement still applies for code changes (file before commit, reference in commit message). Docs-only commits to agent playbooks may skip the tracker (matches existing `docs(workflow): ...`, `docs(review): ...` precedent). Default remains branch + PR.

## Branch and PR

Branch and commit conventions: see `AGENTS.md § Skill bindings`.

PR title: `<type>(<scope>): short intent (<issue-id>)`. PR description follows the structured contract in `docs/code-review.md`. PRs without a linked tracker issue are not merged.

## Tracker status lifecycle

- `Backlog` → `In Progress` (implementation started) → `In Review` (PR open) → `Done` (merged + AC verified).
- Scope changes during implementation/review: choose either broaden current issue (small/related) or split off new issue (substantial). Decide before continuing.

## Worktree lifecycle

- Implementer + Reviewer share one worktree per issue (Git allows only one branch checkout at a time).
- Created at Implementer kickoff. Persists through review cycles and follow-up commits.
- Deleted only after merge (or abandonment).

## Sequential execution

One issue in flight at a time per Orchestrator. No parallel Implementers from one Orchestrator. If parallelism is genuinely needed, run a second Claude Code instance.

## Reflect-then-clear cadence

Both roles `/clear` at natural boundaries. Orchestrator: post-merge. Curator: post-`/to-issues`, post-PRD-publish, or end of working session. **No mid-work `/clear`.** If the 150k context threshold approaches mid-work, finish the current cycle, then reflect-and-clear; don't pre-bake escape behavior.

## Scope control

- Don't implement work outside the current issue unless it blocks delivery.
- Blockers from missing prerequisites → file a separate tracker issue.
- Ambiguous AC → refine in tracker before implementation, or grill-and-lock during `/kickoff` Phase 2.
- Substantial new work surfaced during review → recommend new tracker issue, not PR expansion.

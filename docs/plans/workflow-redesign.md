# Workflow Redesign Plan: Compose Lifecycle from Skills

**Status:** Locked. Grill complete. Full implementation handover in §16. After `/clear`, fresh session reads this entire plan and executes §16 in order on the existing branch (`claude/recursing-mclaren-74d6ea`, PR #18).
**Author:** Orchestrator (with conservative + greenfield agent inputs and user direction).
**Scope:** This plan describes HOW the project's workflow will be restructured. It does not implement any changes. Implementation gates on grill + user sign-off.

---

## 1. Goal

Restructure the workflow so that:

1. **Skills are project-agnostic primitives.** Anyone could drop them into a different repo without editing the skill body.
2. **Project specifics live in four well-known artifacts:** `CONTEXT.md` (domain glossary), `AGENTS.md` (roles + skill bindings + invariants), `docs/prd/` (initiatives), `docs/adr/` (decisions).
3. **The lifecycle is composed of skill invocations**, described in a single top-level `docs/workflow.md`. That doc is itself project-agnostic; project specifics are referenced from `AGENTS.md`.
4. **Everything we use lives in the repo.** No global-only skills. No gitignored load-bearing state.

---

## 2. Principles

- **Skill = primitive. Workflow = composition.** Skills don't know which workflow they're part of.
- **Project specifics don't leak into skills.** Skills reference `AGENTS.md` for tracker, branch conventions, validation commands, label vocabulary, commit format.
- **Role names are conceptual and portable.** Curator, Orchestrator, Implementer, Reviewer, user describe function — they live directly in skill bodies, no indirection.
- **One workflow doc, not many.** `docs/workflow.md` is the entry point. `docs/agent/*.md` files are focused playbooks (testing, code-review, decision-records).
- **Plans are first-class, checked-in artifacts.** All plans live in `docs/plans/`. Issue-level plans (Implementer spawn prompts) and initiative-level plans (cross-cutting design like this one) share one location and one vocabulary.
- **No mid-work `/clear`.** Both roles `/clear` at natural boundaries only.

---

## 3. Roles

- **user** — the human. Sets direction, picks issues, owns final merge in manual mode.
- **Curator** — strategic role. Owns ideation, `/to-prd`, `/to-issues`, PRD-level `/grill-with-docs`, and standalone `/triage` for occasional backlog grooming (rare). Sessions are typically PRD-shaped: spin up to shape a PRD, stay warm during decomposition, end after `/to-issues` publishes.
- **Orchestrator** — tactical role. Owns `/kickoff` (triage as Phase 1 + design grill as Phase 2), `/co-review`, `/resume-orchestrator`, `/arch-review`. Per-issue cycles; cold-respawned often.
- **Implementer** — subagent spawned by Orchestrator for a single issue. Worktree-isolated. Disposed after issue ships.
- **Reviewer** — subagent spawned by Orchestrator to review the PR. Same worktree as the Implementer. Disposed after issue ships.

**Role boundary:** Curator's responsibility ends at issue creation (whether single-issue intake or `/to-issues` decomposition from a PRD). Orchestrator owns everything from `/kickoff` onward, including pre-flight triage (workable / needs-info / wontfix) and just-in-time design grilling.

**Two parallel Claude Code instances**: one runs Curator, one runs Orchestrator. They share no context; the tracker (Linear) and `docs/` are the bridge. Role is established implicitly by the first skill invocation in a session — no upfront "you are the Curator" declaration needed.

---

## 4. Target lifecycle

```
[ Stage 0 — Issue intake ]
  Trigger:    user files a bug/ask, OR describes one in a Curator session
  Skill:      direct tracker filing (no skill) OR Curator+tracker MCP
  Actor:      user (Path A) or Curator on user's behalf (Path B)
  Artifact:   tracker issue with body = What + AC + Blocked-by (no implementation design)

[ Stage 1 — PRD (multi-issue scope only) ]
  Trigger:    Initiative spans >3 issues OR introduces user-facing concept OR cross-cutting impact
  Skill:      /to-prd → /grill-with-docs (PRD-level)
  Actor:      Curator + user collaborative
  Artifact:   docs/prd/<slug>.md (Draft); mN- prefix when milestone-assigned
              ADRs filed inline if decisions cross the bar

[ Stage 2 — Decompose ]
  Trigger:    PRD reaches "Active" with locked milestone
  Skill:      /to-issues (vertical slices, AFK/HITL marked)
  Actor:      Curator; user approves slice list before publish
  Artifact:   N tracker issues, body = What + AC + Blocked-by

[ Stage 3 — Wait ]
  Issue sits in backlog. Hours, days, weeks, months — staleness defense lives downstream.

[ Stage 4 — Kickoff (Session A: warm) ]
  Trigger:    user types `/kickoff <ID> [autonomous]`
  Skill:      /kickoff
              Phase 1 = triage (invokes /triage skill, /diagnose for hard-repro bugs)
                        decides: workable | needs-info | wontfix
                        on wontfix: write .out-of-scope/<slug>.md, close, stop
                        on needs-info: comment on issue, stop
              Phase 2 = /grill-with-docs in DELTA MODE against current main
                        produces locked implementation decisions
              Phase 3a = decision gate, write plan file
  Actor:      Orchestrator
  Artifact:   docs/plans/<issue-id>.md (checked in) — Implementer spawn prompt
              Linear updated with deltas

[ Stage 5 — /clear + Spawn (Session B: cold) ]
  Trigger:    user retypes `/kickoff <ID>`; cold Orchestrator detects the plan file
  Skill:      /kickoff Phase 4 (spawn)
  Actor:      Implementer subagent in worktree;
              uses /test-driven-development for new logic modules
  Artifact:   PR with structured description per docs/agent/code-review.md

[ Stage 6 — Review ]
  Trigger:    Implementer reports PR URL
  Skill:      /co-review (cycles 1-2, arbitrate, merge step)
  Actor:      Reviewer subagent + Orchestrator arbitration
  Artifact:   PR with `Orchestrator arbitration:` comments;
              (autonomous) `Mode: autonomous` trace

[ Stage 7 — Merge ]
  Trigger:    Review converged + CI green
  Skill:      /co-review Phase 4
  Actor:      Orchestrator (autonomous) or user (manual)
  Artifact:   merge commit; tracker → Done

[ Stage 8 — Reflect-and-clear ]
  Trigger:    Post-merge
  Skill:      /co-review Phase 5
  Actor:      Orchestrator
  Artifact:   playbook PR (if codifiable); tracker comment (if project-state)
              docs/plans/<issue-id>.md retained as historical record

[ Stage 9 — Recurring arch review ]
  Trigger:    Cron (weekly) | user-invoked
  Skill:      /arch-review wraps /improve-codebase-architecture
  Actor:      Orchestrator; user supervises (no autonomous arch reviews)
  Artifact:   Each accepted candidate → tracker issue (Stage 0 entry).
              Multi-issue refactors → Curator decomposes via /to-prd.
```

---

## 5. Skill inventory and disposition

| Skill | Source | Action | Run by | Notes |
|---|---|---|---|---|
| `to-prd` | global | Copy + genericize | Curator | Already mostly generic |
| `to-issues` | global | Copy + genericize | Curator | Already mostly generic |
| `triage` | global | Copy + parameterize | Orchestrator (primary, inside `/kickoff` Phase 1); Curator (secondary, standalone for backlog grooming) | Label vocab in `AGENTS.md` |
| `grill-with-docs` | global | Copy as-is | Curator + Orchestrator | Already generic |
| `grill-me` | global | **Discard** | — | Strict subset of grill-with-docs |
| `diagnose` | global | Copy as-is | Orchestrator (in `/kickoff` Phase 1 for hard-repro bugs) + Implementer (during fix loop) | Already generic |
| `test-driven-development` | global | Copy as-is | Implementer | Keep full name |
| `improve-codebase-architecture` | global | Copy as-is | (wrapped by `arch-review`) | Already generic |
| `arch-review` | NEW | Create (thin cron wrapper) | Orchestrator | Cron-only trigger; no counter |
| `kickoff` | local | Refactor | Orchestrator | Phase 1 absorbs triage + diagnose dispatch |
| `co-review` | local | Refactor | Orchestrator | Apply §6 rules |
| `resume-curator` | NEW (split from local `resume`) | Create | Curator | Recovers in-flight PRDs / triage state |
| `resume-orchestrator` | NEW (split from local `resume`) | Create | Orchestrator | Recovers in-flight kickoffs / reviews / merges |

---

## 6. Genericization rules

For any skill in `.claude/skills/`:

| Project-specific term | Generic replacement | Source of truth |
|---|---|---|
| `Linear` / `GitHub Issues` / `Jira` | "the tracker" | `AGENTS.md` § Skill bindings |
| `AWK-XX` | `<issue-id>` | `AGENTS.md` § Skill bindings |
| `pnpm check` / `pnpm test` | "the project's check command" | `AGENTS.md` § Skill bindings |
| `main` | "the default branch" | `AGENTS.md` § Skill bindings |
| `<type>/awk-<n>-<topic>` | "the project's branch naming convention" | `AGENTS.md` § Skill bindings |
| Triage label vocabulary (whatever survives — see §12.1) | "the triage label vocabulary" | `AGENTS.md` § Skill bindings |
| Conventional Commits format | "the project's commit format" | `AGENTS.md` § Skill bindings |

**Roles (Curator, Orchestrator, Implementer, Reviewer, user) are NOT genericized** — they are the workflow's role names per §3, used directly in skill bodies.

---

## 7. Plans as a single artifact class

All plans live in `docs/plans/`, checked in. No `.claude/plans/`, no `.claude/handoffs/`.

| Plan type | Example path | Lifetime |
|---|---|---|
| Issue-level (Implementer spawn prompt) | `docs/plans/awk-42.md` | Created at `/kickoff` Phase 3a; retained after merge |
| Initiative-level (cross-cutting design) | `docs/plans/workflow-redesign.md` | Indefinite |

Why converge:
- Issue-level plans survive `/clear`, machine swap, and crash — fixes gitignored-handoff fragility.
- Plans become part of the PR audit trail.
- Grillable without `.gitignore` friction.
- One vocabulary, one location.

**Issue-level plan template** (slim — references, not pastes):

```markdown
---
issue: <issue-id>
branch: <branch-name>
mode: manual | autonomous
created_at: <iso-timestamp>
base_sha: <main HEAD at handoff>
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
- <project's check command> passes.
- <project's test command> passes.
- Commits in <project's commit format>.

## Done criteria
<bullet list — AC-aligned>
```

Target length: ≤100 lines per issue plan. The Linear issue body and AGENTS.md are NOT pasted — Implementer reads them via tools.

`.gitignore`: remove `.claude/handoffs/`. Migrate any existing handoff files into `docs/plans/` during Phase 5.

---

## 8. `AGENTS.md` rewrite

Becomes a tight role + bindings + invariants doc. Lifecycle prose moves to `docs/workflow.md`.

Sections:

1. **Project intro** (1 paragraph).
2. **Roles** — the role names from §3 of this plan with project-specific responsibility scoping.
3. **Core invariants** — current section, mostly intact (canvas iframe rules, etc.).
4. **Skill bindings** (NEW):
   ```markdown
   ## Skill bindings

   - **Tracker:** Linear (via Linear MCP)
   - **Issue ID format:** AWK-<n>
   - **Default branch:** main
   - **Branch naming:** <type>/awk-<n>-<topic>
   - **Validation commands:** `pnpm check`, `pnpm test`
   - **Commit format:** Conventional Commits with `(AWK-XX)` suffix
   - **Triage label vocabulary:** <see §12.1 — what survives>
   ```
5. **Documentation map** — pointer to `docs/workflow.md`, `docs/prd/`, `docs/plans/`, etc.

Cuts (move to `docs/workflow.md`): Default Flow, Linear Status Lifecycle, Plans Policy, Branch and PR Naming details (referenced from § Skill bindings).

---

## 9. `docs/workflow.md`

Project-agnostic. Project specifics referenced from `AGENTS.md`. Structure (sketched):

```markdown
# Workflow

How work flows through this project, end to end. Each stage names the
skill that drives it. Project-specific terms are defined in AGENTS.md.

## Roles
[brief — points to AGENTS.md § Roles]

## Lifecycle overview
[the diagram from §4 of the redesign plan]

## Stage 0 — Issue intake
... (one section per stage)

## Modes (manual vs autonomous)

## Plans
- All plans live in docs/plans/, checked in.
- Issue-level plans created at /kickoff; retained after merge.

## Recovery
[references /resume-curator, /resume-orchestrator]
```

Length target: under 500 lines.

---

## 10. Migration phases (each is a separate PR)

Every fork action: copy from `~/.agents/skills/<name>/` → `.claude/skills/<name>/`; restructure to fit our workflow shape; preserve project-agnosticism per §6 (no `Linear` / `AWK-XX` / `pnpm` in skill bodies — reference `AGENTS.md § Skill bindings`).

**Phase 0 (this PR).** Plan only. Gates on grill + user sign-off.

**Phase 1 — Fork primitives.** Copy from global, minimal customization (these have no workflow-shape ties):
- `grill-with-docs`, `diagnose`, `test-driven-development`, `improve-codebase-architecture`.

**Phase 2 — Fork + customize lifecycle skills.** Heavy customization for our workflow shape:
- `to-prd` — minor; mostly preserve.
- `to-issues` — minor; preserve, ensure issues are filed without triage labels.
- `triage` — heavy: rewrite as a 3-decision sub-procedure (workable / needs-info / wontfix) callable from `/kickoff` Phase 1. Drop the 5-state machine and label-applying logic. Standalone backlog-grooming invocation also supported.

**Phase 3 — Add `arch-review`.** Thin cron-triggered wrapper around `/improve-codebase-architecture`. No counter.

**Phase 4 — Refactor existing local skills + role rename.** One PR per skill:
- `kickoff/SKILL.md` — apply §6, rename CPTO → Orchestrator, integrate `/triage` as Phase 1 sub-procedure, integrate `/diagnose` dispatch for hard-repro bugs.
- `co-review/SKILL.md` — apply §6, rename CPTO → Orchestrator.
- Replace `resume/SKILL.md` with `resume-curator/SKILL.md` and `resume-orchestrator/SKILL.md`.

**Phase 5 — Consolidate plans.**
- Migrate any existing `.claude/handoffs/*.md` → `docs/plans/`.
- Update `.gitignore` (drop `.claude/handoffs/`).
- Update skill references.

**Phase 6 — Rewrite `AGENTS.md`. Write `docs/workflow.md`. Delete `docs/agent/workflow.md`.**

**Phase 7 — First `/arch-review` dry run.** Validate end-to-end.

---

## 11. Decisions baked in (locked)

- **Triage runs against an existing issue, never before issue creation.**
- **Triage's grill (now `/kickoff` Phase 1) is light. Design grill (Phase 2) is heavy.** Triage doesn't lock implementation because issues sit for weeks/months; design grill happens against current main.
- **Issue body holds AC; implementation design lives in plan + PR description.** Never written back to issue body. Staleness defense.
- **`grill-me` discarded** in favor of `grill-with-docs`. Wrong default for a CONTEXT-rich project.
- **Single plans directory: `docs/plans/`, checked in.** Replaces `.claude/handoffs/`.
- **Roles project-agnostic and used directly in skill bodies.** No AGENTS.md indirection layer for roles. CPTO → Orchestrator; CEO → user; Implementer/Reviewer unchanged.
- **Two-role split: Curator (strategic) + Orchestrator (tactical).** Boundary at issue creation. Curator runs PRD work + decompose + occasional standalone triage. Orchestrator runs everything from `/kickoff` onward (pre-flight triage Phase 1 + design grill Phase 2).
- **Two parallel Claude Code instances.** Curator and Orchestrator run in separate sessions. Role established implicitly by the first skill invocation; no upfront declaration.
- **`/resume` splits into `/resume-curator` and `/resume-orchestrator`.** Each recovers its role's state.
- **Both roles `/clear` at natural boundaries; no mid-work `/clear`.** If 150k threshold approaches mid-work, handle it then — don't pre-bake escape behavior.
- **`/arch-review` trigger: cron + user-invoked only.** No counter, no cycle-2 detection automation. `.claude/state/` not created.
- **Issue-level plan template is slim.** References (`Required reading`) instead of pastes. Locked decisions are the unique content.
- **Triage stage as a separate lifecycle step is dropped.** `/triage` survives as a callable skill; primary use is inside `/kickoff` Phase 1, secondary is standalone Curator backlog grooming.
- **All issues triaged before implementation.** `/kickoff` Phase 1 IS the triage step; every issue passes through it.
- **No triage label vocabulary.** `/kickoff` Phase 1 decisions (workable / needs-info / wontfix) are *transient* — they route Phase 1's next branch, not persistent state to communicate. Linear's native states + assignee + comments cover every prior label use.
- **`bug` vs `enhancement` is a Linear *category* label** (separate from triage state — labels for triage are dropped, but `bug`/`enhancement` survives because Phase 1 needs the signal to decide whether `/diagnose` runs and whether wontfix writes to `.out-of-scope/`).
- **Skills are forked into `.claude/skills/` from global and customized for our workflow shape, but remain project-agnostic** via `AGENTS.md § Skill bindings`. Customization changes the *procedure* (e.g., `/triage` becomes a Phase 1 sub-procedure of `/kickoff`); it doesn't bake project-specific terms into skill bodies.

---

## 12. Defaults applied (no remaining grill questions)

These were tunable during the grill; locked at default for handover. Override later if real-world signal warrants.

1. **`/diagnose` placement.** Inside `/kickoff` Phase 1 for hard-repro bugs (Orchestrator), and inside the Implementer subagent during the fix loop. Curator never invokes `/diagnose`.
2. **Curator session lifecycle.** Ephemeral, per-PRD. Each PRD spins up a Curator session, ends after `/to-issues`. Standalone backlog grooming is a separate brief invocation.
3. **Refactor budget.** Soft — track-only, no milestone block. Revisit after 3 milestones.
4. **Issue-level plans retention.** Retain forever post-merge.
5. **`.out-of-scope/` location.** Repo root, per global `triage` skill convention.
6. **`arch-review` tracker label.** Yes — Linear label, separate from any triage label vocabulary, created in Phase 3.
7. **Phase 4 split.** Three PRs (one per refactored skill).
8. **Linear cycles.** Ignore for now; milestones are the unit of grouping. Revisit if cadence pressure builds.
9. **Plans index.** `docs/plans/README.md` exists, lists initiative-level plans only (issue-level plans are too numerous to index).

---

## 13. Risks

1. **Skill drift between local copies and global originals.** Mitigation: document `last-synced-commit` in a comment at the top of each local copy.
2. **Genericization may sand off useful sharpness.** Mitigation: skills reference `AGENTS.md` by concrete section heading.
3. **Migration touches files used daily.** Phased PRs, dogfood between each.
4. **Curator/Orchestrator boundary requires discipline.** Mitigation: `/kickoff` Phase 1 enforces — if issue is missing, malformed, or scope is unclear, Phase 1 routes to wontfix/needs-info, not implementation.
5. **Plans dir clutter over time.** Accept; revisit after one milestone if it becomes painful.
6. **Existing PR comments use `CPTO arbitration:`.** New comments use `Orchestrator arbitration:`. Mild historical inconsistency; not load-bearing.
7. **Two-window operational overhead.** User keeps two Claude Code instances. Heavier than single-CPTO; payoff is independent context preservation.

---

## 14. Out of scope

- Hard refactor budget enforcement (deferred — see §12.4).
- Migrating existing `docs/prd/` or `docs/adr/` content.
- Multi-context (`CONTEXT-MAP.md`) support. Deloop is single-context.
- Three-role split (separate Architect). Deferred until observed need.
- Counter-based or quality-signal-based `/arch-review` triggers. Deferred until cron + user-invoked proves insufficient.

---

## 15. Done criteria

- All skills used live under `.claude/skills/` with project-agnostic bodies (modulo role names per §6).
- `AGENTS.md` § Skill bindings is the single lookup for project-specific terms.
- `docs/workflow.md` exists, ≤500 lines.
- `docs/plans/` is the single plan directory.
- `.claude/handoffs/` no longer exists.
- Roles: Curator and Orchestrator named in `AGENTS.md` § Roles and used directly in skill bodies.
- `/resume-curator` and `/resume-orchestrator` exist as separate skills.
- `/arch-review` fires successfully at least once via cron, produces ≥1 candidate, candidate enters tracker as a normal issue.
- One full issue cycle ships post-refactor (validation: pick a small AFK issue, run cold, verify `/kickoff` Phase 1 triage works inline).

---

## 16. Implementation handover

**How to use this section.** This is the spawn prompt for the post-`/clear` Implementer session. Read §1–§15 first for context (decisions, locks, defaults). Then execute §16 in order. Commit per phase. All work lands in PR #18 on branch `claude/recursing-mclaren-74d6ea`.

The full conversation that produced this plan is gone after `/clear`. This document is self-contained — every locked decision lives in §11, every defaulted choice lives in §12, every architectural rationale lives in §1–§9. Don't re-grill; just execute.

### 16.1 Conventions

- **Branch:** `claude/recursing-mclaren-74d6ea` (current; PR #18 already open).
- **Commit format:** Conventional Commits. **No `(AWK-XX)` suffix** — this is workflow infrastructure, not a tracker issue. Example: `feat(skills): fork primitive skills from global into .claude/skills/`.
- **Granularity:** one commit per §16.X subsection, finer if a subsection touches >5 files.
- **Co-author trailer:** include `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` per existing repo convention.
- **Lint-staged:** if pre-commit hook fails with `lint-staged could not find any staged files matching configured tasks`, that's fine — the commit still lands.
- **Pre-commit hook may need pnpm install** if tools are missing on first commit.

### 16.2 Phase 1 — Fork primitives (verbatim copy)

```bash
cp -R ~/.agents/skills/grill-with-docs .claude/skills/grill-with-docs
cp -R ~/.agents/skills/diagnose .claude/skills/diagnose
cp -R ~/.agents/skills/test-driven-development .claude/skills/test-driven-development
cp -R ~/.agents/skills/improve-codebase-architecture .claude/skills/improve-codebase-architecture
```

For each forked `SKILL.md`, prepend (right under the frontmatter close `---`):

```markdown
<!-- Forked from ~/.agents/skills/<name>/SKILL.md on 2026-05-09. Project-agnostic primitive; no customization. -->
```

These four are project-agnostic; no body changes.

**Validate:** `ls .claude/skills/` shows all 4 new directories with `SKILL.md` and any helper files (e.g. `LANGUAGE.md`, `CONTEXT-FORMAT.md`, `ADR-FORMAT.md`).

**Commit:** `feat(skills): fork primitive skills from global`

### 16.3 Phase 2 — Fork + customize lifecycle skills

**`to-prd`:**

```bash
cp -R ~/.agents/skills/to-prd .claude/skills/to-prd
```

Edit `.claude/skills/to-prd/SKILL.md`:
- Drop the `/setup-matt-pocock-skills` mention. Replace with: "tracker and label vocabulary are defined in `AGENTS.md § Skill bindings`."
- Verify output: `docs/prd/<slug>.md` (with `mN-` prefix when milestone-assigned per AGENTS.md).
- Add fork-header comment per §16.2.

**`to-issues`:**

```bash
cp -R ~/.agents/skills/to-issues .claude/skills/to-issues
```

Edit `.claude/skills/to-issues/SKILL.md`:
- **Drop** the line "Apply the `needs-triage` triage label so each issue enters the normal triage flow." Issues are filed without triage labels (§11.16).
- Issue body template stays: `Parent / What to build / Acceptance criteria / Blocked by`.
- Add fork-header comment per §16.2.

**`triage`** (HEAVY restructure — replace body):

```bash
cp -R ~/.agents/skills/triage .claude/skills/triage
```

**Replace** `.claude/skills/triage/SKILL.md` body with the new 3-decision sub-procedure shape:

```markdown
---
name: triage
description: Pre-flight check for an existing issue before implementation. Decides workable / needs-info / wontfix. Primary use: invoked from /kickoff Phase 1. Secondary use: standalone for backlog grooming.
---

<!-- Forked from ~/.agents/skills/triage/SKILL.md on 2026-05-09. Heavy restructure: 5-state machine collapsed into 3-decision procedure; label-applying logic dropped (§11.16); designed as /kickoff Phase 1 sub-procedure. -->

# Triage

Pre-flight an existing tracker issue before any implementation work.

Tracker, branch conventions, and label vocabulary are defined in `AGENTS.md § Skill bindings`.

## Inputs

- Issue ID.
- Caller context (from /kickoff Phase 1, or standalone).

## Process

1. **Read the issue.** Body, comments, dependency links, the `bug` / `enhancement` category label. Read recently-touched files in the area the issue mentions. Parse any prior triage notes in the comments to avoid re-asking resolved questions.

2. **For bugs: attempt repro.** Trace the relevant code; run tests or commands as appropriate. If repro is hard, invoke `/diagnose` Phase 1 only (build feedback loop, attempt repro). Return findings to the caller; do not run the full `/diagnose` loop here.

3. **Decide:**
   - **workable** — AC is testable, scope bounded, repro confirmed (if bug). Return control to caller.
   - **needs-info** — required information missing. Post a comment with specific, actionable questions (no "please provide more info"). Stop. Issue stays in tracker Backlog with assignee = the user.
   - **wontfix** — out-of-scope, duplicate, or obsolete. Bugs: close with explanation. Enhancements: close + write `.out-of-scope/<slug>.md` (so future arch reviews don't re-suggest).

4. **Disclaimer.** Every triage-authored tracker comment starts with: `> *This was generated by AI during triage.*`

## Standalone use (Curator backlog grooming)

When invoked outside `/kickoff` (rare), iterate over a list of issues. Autonomous mode skips per-issue confirmation but **always requires manual confirmation before any wontfix close** (extra circuit breaker).

## Reference docs

- [OUT-OF-SCOPE.md](OUT-OF-SCOPE.md) — `.out-of-scope/` knowledge-base format.
```

**Delete `.claude/skills/triage/AGENT-BRIEF.md`** — agent briefs are obsolete; their role is taken by issue-level plans (`docs/plans/<id>.md`).

**Keep `.claude/skills/triage/OUT-OF-SCOPE.md`** verbatim from the global skill.

**Commit:** `feat(skills): fork lifecycle skills (to-prd, to-issues, triage); restructure triage as 3-decision sub-procedure`

### 16.4 Phase 3 — Create `arch-review` wrapper

New file `.claude/skills/arch-review/SKILL.md`:

```markdown
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
```

**Commit:** `feat(skills): add /arch-review wrapper for periodic architecture review`

### 16.5 Phase 4 — Refactor existing local skills

**`.claude/skills/kickoff/SKILL.md`** — substantial rewrite. Read the current file first to preserve structure. Apply these changes:

- Find/replace: `CPTO` → `Orchestrator`. `CEO` → `user`.
- **Phase 0** (handoff detection): change path check from `.claude/handoffs/<ISSUE_ID>.md` to `docs/plans/<issue-id>.md` (lowercase id matches §7 convention).
- **Phase 1 — NEW: triage sub-procedure.** Replace whatever Phase 1 currently contains (mode + issue selection happens at invocation now, not as a phase). New Phase 1:
  - Verify issue exists and has body. If not, refuse to kickoff.
  - Invoke `/triage` skill (sub-procedure call). Three branches:
    - workable → proceed to Phase 2.
    - needs-info → stop; comment was posted by triage. Report back to user.
    - wontfix → stop; issue closed and `.out-of-scope/` written by triage.
- **Phase 2 — design grill.** Replace freeform "Walk the decision tree" with: "Run `/grill-with-docs` in DELTA MODE against current `main`. Resolves only what's drifted: codebase changes since issue filed, new ADRs, scope still valid. Lock implementation decisions."
- **Phase 3a — decision gate + plan write.** Path: `docs/plans/<issue-id>.md` (was `.claude/handoffs/<ISSUE_ID>.md`). Use the slim plan template from §7 of this redesign plan (frontmatter + Source + Locked decisions + Required reading + Branch + Validation + Done criteria). **Do not paste** Linear issue body or AGENTS.md rules — the Implementer reads them via tools.
- **Test-layer fix-shape check** (existing block) — preserve verbatim. Project-specific invariant.
- **Phase 4 — spawn.** Path: `docs/plans/<issue-id>.md`. Pass plan body verbatim to `Agent` tool with `isolation: "worktree"`.
- **Phase 5, 6** (autonomous trace, chain to /co-review) — preserve, just rename role refs.
- **Circuit breakers** — preserve verbatim.
- **Drop** any references to triage labels (`needs-triage`, `ready-for-agent`).

**`.claude/skills/co-review/SKILL.md`** — minor:

- Find/replace: `CPTO` → `Orchestrator`. `CEO` → `user`. (`CPTO arbitration:` PR comment prefix becomes `Orchestrator arbitration:`.)
- **Phase 4 cleanup**: **REMOVE** the line `4. Delete the pre-spawn handoff if it exists: rm -f .claude/handoffs/<ISSUE_ID>.md`. Plans are retained per §11.5.
- **Phase 5 (Reflect-and-clear)** — no counter increment; cron handles arch-review trigger (§11.11).

**Replace `.claude/skills/resume/` with `resume-curator/` + `resume-orchestrator/`:**

```bash
rm -rf .claude/skills/resume
mkdir -p .claude/skills/resume-curator .claude/skills/resume-orchestrator
```

`.claude/skills/resume-curator/SKILL.md`:

```markdown
---
name: resume-curator
description: Cold-start recovery for Curator. Scans the tracker for in-flight PRDs and docs/prd/ for Draft-status files. Read-only by default. Run on every Curator cold start before accepting new instructions.
---

# Resume — Curator

You are the Curator. This skill reconstructs strategic in-flight state after a session restart, crash, or `/clear`.

**Read-only by default.** Report state and propose actions; do not modify until the user confirms.

Tracker, role, and label conventions are defined in `AGENTS.md § Skill bindings`.

## Phase 1 — Scan sources

In parallel:
1. **Tracker:** list issues in any state pre-`In Progress` that have a PRD reference (typically Backlog with `PRD: docs/prd/...` in body).
2. **`docs/prd/`:** list files with status `Draft`.
3. **`docs/plans/`:** list initiative-level plans (those without an issue-id frontmatter).

## Phase 2 — Classify

For each PRD:
- **Mid-shape** (Draft, no `mN-` prefix yet, no decompose run) → propose: continue grilling (read PRD, run /grill-with-docs).
- **Milestone-assigned but not decomposed** (mN- prefix, no child issues filed) → propose: run /to-issues.
- **Decomposed** (child issues exist) → no Curator action; Orchestrator picks up via /kickoff.

## Phase 3 — Report

Concise table. User picks which to resume, or no action.

## Notes

- Never modifies state in Phase 1-2.
- Curator typically `/clear`s less often than Orchestrator; if no in-flight strategic work, the Curator session is brief.
```

`.claude/skills/resume-orchestrator/SKILL.md`:

(Use the existing `.claude/skills/resume/SKILL.md` as the template. Apply role rename. Update path source: `docs/plans/<id>.md` instead of `.claude/handoffs/<ISSUE_ID>.md`. Drop the "post-grill, pre-spawn" classification's plan-detection logic to read from `docs/plans/`.)

```markdown
---
name: resume-orchestrator
description: Cold-start recovery for Orchestrator. Scans the tracker, git worktrees, GitHub PRs, and docs/plans/ for in-flight implementation work. Read-only by default.
---

# Resume — Orchestrator

You are the Orchestrator. This skill reconstructs tactical in-flight state after a session restart, crash, or `/clear`.

**Read-only by default.** Report state and propose actions; do not respawn, merge, or modify until the user confirms (or until the issue's autonomous-mode trace authorizes it — see Phase 3).

Tracker, branch, and label conventions are defined in `AGENTS.md § Skill bindings`.

## Phase 1 — Scan sources of truth

Run in parallel:
1. **Tracker:** list issues in `In Progress` or `In Review`.
2. **Git:** `git worktree list`. Note branches and clean/dirty state.
3. **GitHub:** open PRs in the repo. Capture title, branch, CI status, and PR comment thread.
4. **Plans:** files in `docs/plans/<id>.md` (issue-level — those with `issue:` frontmatter).

## Phase 2 — Classify

For each in-flight item, determine state:
- **Post-grill, pre-spawn** (plan exists, no worktree, no PR) → propose `/kickoff <ID>` to spawn Implementer.
- **Implementation incomplete** (no PR, dirty worktree) → cold respawn Implementer with worktree-resume context.
- **PR open, no review yet** → spawn Reviewer (cycle 1).
- **PR open, `Orchestrator arbitration:` posted, no follow-up commits** → cold-respawn Implementer (cycle 2).
- **PR open, follow-up commits since cycle-1 arbitration, no cycle-2 arbitration** → cold-respawn Reviewer.
- **PR open, cycle-2 arbitration posted, CI green** → hand to /co-review merge phase.
- **Merged but worktree/branch not cleaned** → cleanup only.
- **Tracker says In Progress/In Review but no matching PR/worktree/plan** → orphan; surface to user.

## Phase 3 — Detect mode

Scan PR thread for `Mode: autonomous (user-authorized)` (or legacy `Mode: autonomous (CEO-authorized)`). If present, Orchestrator may resume autonomously. Otherwise manual.

## Phase 4 — Report and propose

Concise table to the user. Each row: ID, state, classification, proposed action.

## Phase 5 — Resume

For each confirmed item, hand off to the appropriate skill phase (`/kickoff` Phase 4, `/co-review` phase X, or cleanup-only).

## Notes

- Phase 1-4 never modify state.
- If recovery surfaces inconsistency (PR merged but tracker says In Review, etc.), surface as anomaly; do not auto-correct.
```

**Commit (or split into multiple within this phase):** `refactor(skills/kickoff): integrate triage as Phase 1; rename CPTO→Orchestrator`, `refactor(skills/co-review): retain plans, role rename`, `refactor(skills/resume): split into resume-curator and resume-orchestrator`.

### 16.6 Phase 5 — Consolidate plans

```bash
# 1. Migrate any existing handoffs (likely none in this fresh worktree, but check)
ls .claude/handoffs/ 2>/dev/null
# If files exist, move:
# git mv .claude/handoffs/*.md docs/plans/

# 2. Remove the old directory
rm -rf .claude/handoffs/
```

**Edit `.gitignore`** — remove these two lines (the comment and the path):

```
# CPTO pre-spawn handoff files (session-local; see AGENTS.md Session Hygiene).
.claude/handoffs/
```

(Skill files in §16.5 already updated to use `docs/plans/`.)

**Commit:** `chore: consolidate plans into docs/plans/; remove .claude/handoffs/`

### 16.7 Phase 6 — Rewrite AGENTS.md, write docs/workflow.md, delete docs/agent/workflow.md

**`AGENTS.md`** — substantial rewrite. **Read the current file first** to preserve project-specific content (Core Invariants, Contract Source of Truth). Target shape:

```markdown
# Deloop Agent Rules

[1-paragraph project intro from current AGENTS.md, preserved.]

PRDs live in `docs/prd/`. Plans live in `docs/plans/`. Decisions live in `docs/adr/`. Domain glossary in `CONTEXT.md`.

## Roles

- **user** — the human. Sets direction, picks issues, owns final merge in manual mode.
- **Curator** — strategic. Owns ideation, /to-prd, /to-issues, PRD-level /grill-with-docs, occasional standalone /triage.
- **Orchestrator** — tactical. Owns /kickoff (triage Phase 1 + design grill Phase 2), /co-review, /resume-orchestrator, /arch-review.
- **Implementer** — subagent spawned by Orchestrator for a single issue. Worktree-isolated. Disposed after issue ships.
- **Reviewer** — subagent spawned by Orchestrator to review the PR. Same worktree as Implementer. Disposed after issue ships.

Curator and Orchestrator run as **two parallel Claude Code instances**. They share no context; the tracker (Linear) and `docs/` are the bridge. Role is established implicitly by the first skill invocation in a session.

## Core Invariants (never break)

[Preserve verbatim from current AGENTS.md — these are project-specific architecture rules.]

## Skill bindings

- **Tracker:** Linear (via Linear MCP).
- **Issue ID format:** `AWK-<n>`.
- **Default branch:** `main`.
- **Branch naming:** `<type>/awk-<n>-<topic>` (types: `feat`, `fix`, `refactor`, `docs`, `test`, `task`).
- **Validation commands:** `pnpm check`, `pnpm test`.
- **Commit format:** Conventional Commits with `(AWK-XX)` suffix (workflow-infra commits omit the suffix).
- **Category labels:** `bug`, `enhancement`, `arch-review`. (No triage labels; Phase 1 decisions are transient.)
- **Scheduling for `/arch-review`:** weekly cron (operational setup; not code).

## Contract Source of Truth

[Preserve verbatim.]

## Delivery Source of Truth

- Linear is the source of truth for feature scope, AC, milestones, roadmap.
- One issue per branch/worktree, one PR per issue.
- Branch hygiene before each kickoff: `git fetch --prune` + delete merged local branches.

## Skills

- **Curator:** /to-prd, /to-issues, /grill-with-docs, /triage (standalone), /resume-curator.
- **Orchestrator:** /kickoff, /co-review, /resume-orchestrator, /arch-review. (`/triage` is invoked internally as a Phase 1 sub-procedure.)
- **Role-agnostic primitives:** /diagnose, /improve-codebase-architecture, /test-driven-development.

## Documentation

- `README.md` — project intro
- `CONTEXT.md` — domain glossary
- `AGENTS.md` (this file) — agent rules, roles, skill bindings, invariants
- `docs/workflow.md` — lifecycle composition (how work flows end-to-end)
- `docs/prd/` — initiative PRDs (`foundation.md` vision, `mN-<slug>.md` milestone, `<slug>.md` unscheduled)
- `docs/adr/` — architectural decisions
- `docs/plans/` — implementation plans (issue-level + initiative-level)
- `docs/agent/testing.md`, `code-review.md`, `decision-records.md` — focused playbooks

Read on-demand when relevant.
```

**Cuts from current AGENTS.md** (move to `docs/workflow.md`):
- "Default Flow"
- "Linear Status Lifecycle"
- "Plans Policy"
- "Session Hygiene" (becomes workflow.md § Recovery + § Modes)
- "Strategic flows" note (collapsed; covered by two-role model)

**Trim from current AGENTS.md** (drop verbatim, content captured elsewhere):
- "Orchestration Rules" — most moves to workflow.md (cycles, autonomy, circuit breakers); a few stay in AGENTS.md as invariants if project-specific.

**`docs/workflow.md`** — new file. Target shape:

```markdown
# Workflow

How work flows through this project end-to-end. Each stage names the
skill that drives it. Project-specific terms are defined in
`AGENTS.md § Skill bindings`.

## Roles

[brief — points to AGENTS.md § Roles]

Two parallel Claude Code instances: Curator (strategic) + Orchestrator (tactical).

## Lifecycle overview

[the Stage 0–9 diagram from §4 of the redesign plan]

## Stage 0 — Issue intake

User files directly in the tracker, OR describes the issue in a Curator session and Curator files via tracker MCP. Body = What + AC + Blocked-by. No implementation design.

## Stage 1 — PRD (multi-issue scope)

Trigger: initiative spans >3 issues, introduces user-facing concept, or has cross-cutting impact.
Curator runs /to-prd → /grill-with-docs. Output: docs/prd/<slug>.md (Draft).

## Stage 2 — Decompose

Trigger: PRD reaches Active with locked milestone.
Curator runs /to-issues. Output: N tracker issues, body = What + AC + Blocked-by.

## Stage 3 — Wait

Issues sit in Backlog. Hours, days, weeks, months — staleness defense lives downstream.

## Stage 4 — Kickoff (warm session)

Trigger: user types `/kickoff <ID> [autonomous]`.
Orchestrator runs /kickoff:
- Phase 1 = triage (workable / needs-info / wontfix). Bugs may invoke /diagnose Phase 1.
- Phase 2 = /grill-with-docs DELTA MODE against current main. Lock decisions.
- Phase 3a = decision gate; write docs/plans/<id>.md.

## Stage 5 — /clear + Spawn (cold session)

User retypes /kickoff <ID>. Cold Orchestrator detects the plan file. Phase 4 spawns Implementer. Implementer uses /test-driven-development for new logic modules.

## Stage 6 — Review

Orchestrator runs /co-review. Reviewer subagent + arbitration. Up to 2 cycles.

## Stage 7 — Merge

CI green + review converged. Manual: user merges. Autonomous: Orchestrator merges per project convention.

## Stage 8 — Reflect-and-clear

Update tracker, write playbook PR if codifiable, /clear before next /kickoff. docs/plans/<id>.md retained.

## Stage 9 — Recurring arch review

Cron (weekly) | user-invoked. /arch-review wraps /improve-codebase-architecture. Outputs candidates → tracker issues (Stage 0 entry).

## Modes

- **Manual** (default). Per-step user confirmation; user merges.
- **Autonomous.** Per-issue verbal opt-in by user. Orchestrator may merge after review converges. Circuit breakers: scope ambiguity unresolvable from issue context, destructive ops outside merge flow, repeated CI failure (one `gh run rerun` retry, then ask).

## Plans

- All plans live in `docs/plans/`, checked in.
- **Issue-level plans:** `docs/plans/<issue-id>.md`. Created at /kickoff Phase 3a. Retained after merge as historical record.
- **Initiative-level plans:** `docs/plans/<slug>.md`. Indefinite lifetime.
- `docs/plans/README.md` indexes initiative-level plans.

Plan template for issue-level — see this redesign plan §7.

## Recovery

- **Curator cold-start:** /resume-curator scans tracker for PRD drafts + docs/prd/ Draft files.
- **Orchestrator cold-start:** /resume-orchestrator scans tracker (In Progress/In Review) + git worktrees + GitHub PRs + docs/plans/ files.

## Direct-to-main exception

Trivial unblocking infra (CI config, dependency-pin updates, docs-only edits) may go directly to main when user explicitly authorizes. Issue requirement still applies for code changes. Default remains branch + PR.

## Branch and PR

Branch: per AGENTS.md § Skill bindings. PR title: `<type>(<scope>): short intent (<issue-id>)`. PR description follows the structured contract in `docs/agent/code-review.md`. PRs without a linked issue are not merged.

## Sequential execution

One issue in flight at a time per Orchestrator. No parallel Implementers.

## Reflect-then-clear cadence

Both roles `/clear` at natural boundaries. Orchestrator: post-merge. Curator: post-/to-issues, post-PRD-publish, or end of working session. **No mid-work `/clear`.**
```

Target length: ≤500 lines.

**Delete `docs/agent/workflow.md`:**

```bash
rm docs/agent/workflow.md
```

**Update `docs/agent/code-review.md`, `docs/agent/testing.md`, `docs/agent/decision-records.md`:**

- Find/replace `CPTO` → `Orchestrator`.
- Find/replace `CEO` → `user`.
- Find/replace `.claude/handoffs/` → `docs/plans/`.
- Verify cross-references to AGENTS.md sections still resolve.

**Commit (or split):** `docs(agents): rewrite AGENTS.md for two-role + skill-bindings model`, `docs(workflow): add docs/workflow.md as lifecycle composition`, `docs(workflow): retire docs/agent/workflow.md`.

### 16.8 Phase 7 — Validation

1. **`/arch-review` smoke test** — invoke once. Confirm it produces output. Don't act on candidates yet.
2. **Skill listing** — run any agent listing skills (the Skill tool list); verify all new skills are visible.
3. **Cross-reference audit** — `grep -rn "CPTO\|CEO\b" .claude/skills/ docs/ AGENTS.md` should return only historical-record matches (e.g. existing PR comment quotes), not active skill body content.
4. **Path audit** — `grep -rn "\.claude/handoffs" .claude/skills/ docs/ AGENTS.md` should return zero matches.

### 16.9 Create docs/plans/README.md

```markdown
# Plans

Index of initiative-level plans (cross-cutting design documents). Issue-level plans (`<issue-id>.md`) are not indexed here — there are too many; they're created and retained per /kickoff Phase 3a.

## Active

- [Workflow Redesign](workflow-redesign.md) — Status: Locked. Compose lifecycle from skills.

## Archive

(none yet)
```

**Commit:** `docs(plans): add docs/plans/README.md index`

### 16.10 Update PR description

Update PR #18 body via `gh pr edit 18 --body "$(cat <<EOF...EOF)"` to reflect the expanded scope:

```markdown
## Summary

- Plan + full implementation of the workflow redesign in one PR.
- Skills forked into `.claude/skills/` from global; customized to fit our workflow shape (triage as `/kickoff` Phase 1; role split into Curator + Orchestrator; etc.).
- Project-agnostic skill bodies; project specifics in `AGENTS.md § Skill bindings`.
- `docs/workflow.md` (new) composes the lifecycle from skill calls.
- `.claude/handoffs/` retired; `docs/plans/` is the single plan directory.
- Plan: [docs/plans/workflow-redesign.md](docs/plans/workflow-redesign.md). Locked decisions in §11; defaults in §12; implementation steps in §16.

## Test plan

- [ ] All new skill bodies have fork-headers.
- [ ] Cross-reference audit clean (no stale `CPTO`/`CEO`/`.claude/handoffs/`).
- [ ] `/arch-review` smoke test passes.
- [ ] Existing test suites still pass: `pnpm check`, `pnpm test`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

### 16.11 Final verification

Walk §15 done criteria. Mark each completed in your final commit message or PR comment.

---

## 17. Notes for the post-`/clear` Implementer

- This redesign is workflow infrastructure, not product code. There are no Linear AC to satisfy. Done = §15 criteria all green + clean cross-reference audit.
- If a step in §16 contradicts a lock in §11, **the lock wins**. Surface the contradiction to the user; don't silently resolve.
- If a step requires information not in this plan (e.g. exact content of an existing file), read the file with the Read tool. Don't guess.
- If a phase's commit hits an unrelated pre-commit-hook failure, run `pnpm install` (the worktree may need it) and retry.
- The grill that produced this plan is captured in the locks (§11) and defaults (§12). Don't re-grill — execute.

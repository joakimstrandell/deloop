# Workflow Redesign Plan: Compose Lifecycle from Skills

**Status:** Locked. Grill complete. Ready for Phase 1 implementation.
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

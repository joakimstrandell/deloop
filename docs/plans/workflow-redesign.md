# Workflow Redesign Plan: Compose Lifecycle from Skills

**Status:** Draft, awaiting grill.
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

- **Skill = primitive. Workflow = composition.** Skills don't know which workflow they're part of. The workflow knows which skills it uses.
- **Project specifics don't leak into skills.** Skills reference `AGENTS.md` for tracker, branch conventions, validation commands, label vocabulary, commit format.
- **Role names are conceptual and portable.** Curator and Orchestrator describe function, not project identity — they live directly in skill bodies.
- **One workflow doc, not many.** `docs/workflow.md` is the entry point. `docs/agent/*.md` files are focused playbooks (testing, code-review, decision-records).
- **Plans are first-class, checked-in artifacts.** All plans live in `docs/plans/`, regardless of scope. Issue-level plans (Implementer spawn prompts) and initiative-level plans (cross-cutting design like this one) share one location and one vocabulary.

---

## 3. Roles

Two orchestration roles + supporting subagents + the human:

- **user** — the human. Sets direction, picks issues, owns final merge in manual mode.
- **Curator** — strategic role. Owns ideation, `/to-prd`, `/to-issues`, `/triage`, PRD-level grilling. Long-running across many issues; rarely `/clear`s.
- **Orchestrator** — tactical role. Owns `/kickoff`, `/co-review`, `/resume`, `/arch-review`. Per-issue cycles; cold-respawned often.
- **Implementer** — subagent spawned by Orchestrator for a single issue. Worktree-isolated. Disposed after issue ships.
- **Reviewer** — subagent spawned by Orchestrator to review the PR. Same worktree as the Implementer. Disposed after issue ships.

The Curator/Orchestrator boundary is at `ready-for-agent`: Curator owns issues up to that label; Orchestrator owns everything from `/kickoff` onward. `/arch-review` produces output (candidate refactor issues) that crosses back to Curator via `/triage`.

(Replaces the prior single CPTO role. Rationale in §11.)

---

## 4. Target lifecycle

```
[ Stage 0 — Idea ]
  Trigger:    user surfaces a thought, bug report, or strategic direction
  Skill:      (none yet)
  Actor:      user + Curator
  Artifact:   either a Linear issue (single-scope) or kicks off Stage 1 (PRD-scope)

[ Stage 1 — PRD (multi-issue scope only) ]
  Trigger:    Initiative spans >3 issues OR introduces user-facing concept OR cross-cutting impact
  Skill:      /to-prd → /grill-with-docs
  Actor:      Curator + user collaborative
  Artifact:   docs/prd/<slug>.md (status: Draft); mN- prefix when milestone-assigned
              ADRs filed inline if decisions cross the bar

[ Stage 2 — Decompose ]
  Trigger:    PRD reaches "Active" with locked milestone
  Skill:      /to-issues (vertical slices, AFK/HITL marked)
  Actor:      Curator; user approves slice list before publish
  Artifact:   N Linear issues, each labeled `needs-triage`,
              body = What + AC + Blocked-by (NO design)

[ Stage 3 — Triage ]
  Trigger:    Linear issue has `needs-triage` label
  Skill:      /triage (calls /diagnose for bugs; /grill-with-docs for fuzzy AC)
  Actor:      Curator
  Output:     `ready-for-agent` | `ready-for-human` | `needs-info` | `wontfix`
  Artifact:   Triage decision as Linear comment (with AI-generated disclaimer)
              `wontfix` enhancements: .out-of-scope/<slug>.md
              `ready-for-agent`: AC sharpened, scope bounded — NO implementation design

[ Stage 4 — Wait ]
  Issue sits in backlog. Hours, days, weeks, months — staleness defense lives here.

[ Stage 5 — Kickoff (Session A: warm) ]
  Trigger:    user types `/kickoff <ID> [autonomous]` against a `ready-for-agent` issue
  Skill:      /kickoff Phase 1-3a
              Phase 2 grill = /grill-with-docs in DELTA MODE against triage-locked AC.
              Resolves only what's drifted: codebase changes, new ADRs, scope still valid.
  Actor:      Orchestrator
  Artifact:   docs/plans/<issue-id>.md (checked in) — Implementer spawn prompt
              Linear issue updated with any deltas surfaced

[ Stage 6 — /clear + Spawn (Session B: cold) ]
  Trigger:    user retypes `/kickoff <ID>`; cold Orchestrator detects the plan file
  Skill:      /kickoff Phase 4
  Actor:      Implementer subagent in worktree;
              uses /test-driven-development for new logic modules
  Artifact:   PR with structured description per docs/agent/code-review.md

[ Stage 7 — Review ]
  Trigger:    Implementer reports PR URL
  Skill:      /co-review (cycles 1-2, arbitrate, merge step)
  Actor:      Reviewer subagent + Orchestrator arbitration
  Artifact:   PR with `Orchestrator arbitration:` comments;
              (autonomous) `Mode: autonomous` trace

[ Stage 8 — Merge ]
  Trigger:    Review converged + CI green
  Skill:      /co-review Phase 4
  Actor:      Orchestrator (autonomous) or user (manual)
  Artifact:   merge commit; Linear → Done

[ Stage 9 — Reflect-and-clear ]
  Trigger:    Post-merge
  Skill:      /co-review Phase 5
  Actor:      Orchestrator
  Artifact:   playbook PR (if codifiable); Linear comment (if project-state).
              Increment arch-review counter. docs/plans/<issue-id>.md retained as record.

[ Stage 10 — Recurring arch review ]
  Trigger:    Cron (weekly) | N-merges-since-last (default: 10)
              | cycle-2 frequency signal | user-invoked
  Skill:      /arch-review wraps /improve-codebase-architecture
  Actor:      Orchestrator; user supervises (no autonomous arch reviews)
  Artifact:   Each accepted candidate → Linear issue with `arch-review` + `needs-triage`
              (re-enters Stage 3 under Curator).
              Multi-issue refactors → docs/prd/<slug>.md.
```

---

## 5. Skill inventory and disposition

| Skill | Source | Action | Run by | Notes |
|---|---|---|---|---|
| `to-prd` | global | Copy + genericize | Curator | Already mostly generic |
| `to-issues` | global | Copy + genericize | Curator | Already mostly generic |
| `triage` | global | Copy + parameterize labels | Curator | Triage label vocab in `AGENTS.md` |
| `grill-with-docs` | global | Copy as-is | Curator + Orchestrator | Already generic |
| `grill-me` | global | **Discard** | — | Strict subset of grill-with-docs |
| `diagnose` | global | Copy as-is | Curator (in triage) + Implementer | Already generic |
| `test-driven-development` | global | Copy as-is | Implementer | Keep full name |
| `improve-codebase-architecture` | global | Copy as-is | (wrapped by `arch-review`) | Already generic |
| `arch-review` | NEW | Create | Orchestrator | Thin cron/counter wrapper |
| `kickoff` | local | Refactor + genericize | Orchestrator | Apply §6 rules |
| `co-review` | local | Refactor + genericize | Orchestrator | Apply §6 rules |
| `resume` | local | Refactor + genericize | Curator + Orchestrator | See §12.3 (single skill or split) |

---

## 6. Genericization rules

For any skill in `.claude/skills/`:

| Project-specific term | Generic replacement | Source of truth |
|---|---|---|
| `Linear` / `GitHub Issues` / `Jira` | "the issue tracker" | `AGENTS.md` § Skill bindings |
| `AWK-XX` | `<issue-id>` | `AGENTS.md` § Skill bindings |
| `pnpm check` / `pnpm test` | "the project's check command" | `AGENTS.md` § Skill bindings |
| `main` | "the default branch" | `AGENTS.md` § Skill bindings |
| `<type>/awk-<n>-<topic>` | "the project's branch naming convention" | `AGENTS.md` § Skill bindings |
| `needs-triage`, `ready-for-agent`, etc. | "the triage label vocabulary" | `AGENTS.md` § Skill bindings |
| Conventional Commits format | "the project's commit format" | `AGENTS.md` § Skill bindings |

**Roles (Curator, Orchestrator, Implementer, Reviewer, user) are NOT genericized** — they are the workflow's role names per §3, used directly in skill bodies. They are conceptual, not project-specific. Other projects adopting these skills adopt these role names too (or fork the skills).

---

## 7. Plans as a single artifact class

All plans live in `docs/plans/`, checked in. No `.claude/plans/`, no `.claude/handoffs/`.

| Plan type | Example path | Lifetime |
|---|---|---|
| Issue-level (Implementer spawn prompt) | `docs/plans/awk-42.md` | Created at `/kickoff`, used post-`/clear`, retained after merge |
| Initiative-level (cross-cutting design) | `docs/plans/workflow-redesign.md` | Indefinite |

Why converge:
- Issue-level plans survive `/clear`, machine swap, and crash — fixes gitignored-handoff fragility.
- Plans become part of the PR audit trail.
- Grillable without `.gitignore` friction.
- Matches "everything we use lives in the repo."
- One vocabulary, one location.

Lifecycle for issue-level plans: created at `/kickoff` Phase 3a (post-grill, pre-spawn). Read by cold Orchestrator at `/kickoff` Phase 4 to spawn Implementer. Retained after merge (cheap; deletion is optional cleanup, not part of the workflow).

`.gitignore`: remove the `.claude/handoffs/` entry. Migrate any existing handoff files into `docs/plans/` during Phase 5.

---

## 8. `AGENTS.md` rewrite

Becomes a tight role + bindings + invariants doc. Lifecycle prose moves to `docs/workflow.md`.

Sections:

1. **Project intro** (1 paragraph).
2. **Roles** — the role names from §3 of this plan, with project-specific responsibility scoping.
3. **Core invariants** — current section, mostly intact (canvas iframe rules, etc.).
4. **Skill bindings** (NEW) — the lookup table:
   ```markdown
   ## Skill bindings

   - **Issue tracker:** Linear (via Linear MCP)
   - **Issue ID format:** AWK-<n>
   - **Default branch:** main
   - **Branch naming:** <type>/awk-<n>-<topic>
   - **Validation commands:** `pnpm check`, `pnpm test`
   - **Commit format:** Conventional Commits with `(AWK-XX)` suffix
   - **Triage labels:** `needs-triage`, `ready-for-agent`, `ready-for-human`, `needs-info`, `wontfix`
   ```
5. **Documentation map** — pointer to `docs/workflow.md`, `docs/prd/`, `docs/plans/`, etc.

Cuts (move to `docs/workflow.md`):
- Default Flow
- Linear Status Lifecycle
- Plans Policy
- Branch and PR Naming details (referenced from § Skill bindings)

---

## 9. `docs/workflow.md` (new top-level composition doc)

Project-agnostic. Project specifics referenced from `AGENTS.md`.

Structure (sketched):

```markdown
# Workflow

How work flows through this project, end to end. Each stage names the
skill that drives it. Project-specific terms (issue tracker, branch
naming, role responsibilities) are defined in AGENTS.md.

## Roles
[brief — points to AGENTS.md § Roles]

## Lifecycle overview
[the diagram from §4 of the redesign plan]

## Stage 0 — Idea
[short prose: trigger, actor, artifact]
... (one section per stage)

## Modes (manual vs autonomous)
[per-issue verbal opt-in, circuit breakers]

## Plans
- All plans live in docs/plans/, checked in.
- Issue-level plans created at /kickoff; retained after merge.
- Initiative-level plans for cross-cutting design (rare).

## Recovery
[references /resume]
```

Length target: under 500 lines. Skills + `AGENTS.md` carry detail.

---

## 10. Migration phases (each is a separate PR)

**Phase 0 (this PR).** Plan only. No code/skill changes. Gates on grill + user sign-off.

**Phase 1.** Copy primitive skills (project-agnostic) to `.claude/skills/`:
- `grill-with-docs`, `diagnose`, `test-driven-development`, `improve-codebase-architecture`.
- Minimal/no genericization.

**Phase 2.** Copy lifecycle skills with parameterization:
- `to-prd`, `to-issues`, `triage`. Apply §6 rules.

**Phase 3.** Add `arch-review` wrapper skill + `.claude/state/arch-review-counter.json` infrastructure.

**Phase 4.** Refactor existing local skills + role rename. One PR per skill (3 PRs):
- `kickoff/SKILL.md` — apply §6 + rename CPTO → Orchestrator, CEO → user.
- `co-review/SKILL.md` — same.
- `resume/SKILL.md` — same. Resolve §12.3 (single or split).

**Phase 5.** Consolidate plans:
- Migrate any existing `.claude/handoffs/*.md` to `docs/plans/`.
- Update `.gitignore` (drop `.claude/handoffs/`).
- Update skill references.

**Phase 6.** Rewrite `AGENTS.md`. Write `docs/workflow.md`. Delete `docs/agent/workflow.md`.

**Phase 7.** First arch-review dry run. Validate the recurring loop end-to-end.

Each phase grillable, shippable, and live for a day before the next.

---

## 11. Decisions baked in (not for grill — already locked)

These are load-bearing; settled before grill so the grill focuses on tunable details.

- **Triage runs against an existing issue, never before issue creation.** Lifecycle: `/to-issues` (or direct issue) → `needs-triage` → `/triage` → `ready-for-agent` → `/kickoff`.
- **Triage's grill is light (AC + terminology). Kickoff's grill is heavy (implementation design against current main).** Triage doesn't lock implementation because issues sit for weeks/months.
- **Issue body holds AC; implementation design lives in the kickoff plan and PR description.** Never written back to issue body. Staleness defense.
- **`grill-me` discarded** in favor of `grill-with-docs`. Wrong default for a CONTEXT-rich project.
- **Single plans directory: `docs/plans/`, checked in.** Replaces `.claude/handoffs/`. Issue-level and initiative-level plans share one location. (See §7.)
- **Roles renamed: CPTO → Orchestrator; CEO → user. Implementer/Reviewer unchanged.** Skill bodies use these names directly; no AGENTS.md indirection layer for roles. Existing `CPTO arbitration:` PR comments stay as historical record; new comments use `Orchestrator arbitration:`.
- **CPTO splits into TWO roles: Curator (strategic) + Orchestrator (tactical).** Boundary at `ready-for-agent`. Three-role split (separate Architect) rejected as over-engineering — `/arch-review` is an Orchestrator entry point, not a distinct session shape.

---

## 12. Open questions (for the grill)

Defaults in italics.

1. **Refactor budget — soft (track-only) or hard (next milestone blocks if unmet)?** *Default: soft. Revisit after 3 milestones.*
2. **Arch-review N-merges threshold?** *Default: 10.*
3. **`/resume` — single skill with role-detection, or split into `/resume-curator` and `/resume-orchestrator`?** *Default: single skill, infers role from in-flight state. Splitting means two cold-start entry points; one is simpler.*
4. **Issue-level plans (`docs/plans/<id>.md`) — retain forever post-merge, or prune as cleanup?** *Default: retain. Disk is cheap; post-mortem value is real.*
5. **`.out-of-scope/` directory — at repo root or under `docs/`?** *Default: repo root, per global `triage` skill convention.*
6. **`arch-review` Linear label — does it exist?** *Default: create as part of Phase 3.*
7. **Phase 4 (refactor existing skills) — single PR or three?** *Default: three, one per skill.*
8. **Curator session lifecycle — when does Curator `/clear`?** *Default: rarely; Curator stays warm across many triages and PRD shapings. Orchestrator `/clear`s after each merge per current Reflect-and-clear discipline.*
9. **Linear cycles — used as project sprints/iterations or ignored?** *Default: ignore for now; milestones are the unit of grouping. Revisit if cadence pressure builds.*
10. **Plans index — does `docs/plans/` get a `README.md` index (mirroring `docs/prd/README.md`)?** *Default: yes, listing active initiative-level plans only (issue-level plans are too numerous to index).*
11. **Initiating Curator vs Orchestrator session — by user choice, or by entry-point skill?** *Default: by skill. Typing `/triage` or `/to-prd` puts you in Curator mode; `/kickoff` puts you in Orchestrator mode. The session "becomes" the role on first skill invocation.*

---

## 13. Risks

1. **Skill drift between local copies and global originals.** Mitigation: document `last-synced-commit` of the global skill in a comment at the top of each local copy; periodic diff.
2. **Genericization may sand off useful sharpness.** Mitigation: skills reference `AGENTS.md` by concrete section heading so the indirection is one hop.
3. **Migration touches files used daily.** Phased PRs, dogfood between each.
4. **Curator/Orchestrator boundary requires discipline.** If Orchestrator starts triaging mid-kickoff, the boundary erodes. Mitigation: `/kickoff` aborts if issue is not `ready-for-agent`.
5. **`arch-review` counter is fragile** (gitignored state file). Cron is the backstop.
6. **Plans dir clutter over time.** If we retain plans forever, `docs/plans/` grows unboundedly. Mitigation accepted; revisit after one milestone if it becomes an issue.
7. **Existing PR comments use `CPTO arbitration:` prefix.** New comments use `Orchestrator arbitration:`. Mild inconsistency for historical record; not load-bearing.
8. **Two roles in one user's head.** The user (the human) has to mentally context-switch between Curator and Orchestrator sessions. Mitigation: skill entry points implicitly select the role; the user never has to type "I am now Curator."

---

## 14. Out of scope

- Hard refactor budget enforcement (deferred — see §12.1).
- Migrating existing `docs/prd/` or `docs/adr/` content.
- Multi-context (`CONTEXT-MAP.md`) support. Deloop is single-context.
- Evolving Curator/Orchestrator into three roles (separate Architect). Defer until observed need.

---

## 15. Done criteria

- All skills used live under `.claude/skills/` with project-agnostic bodies (modulo role names per §6).
- `AGENTS.md` § Skill bindings is the single lookup for project-specific terms.
- `docs/workflow.md` exists, ≤500 lines, references skills by name and `AGENTS.md` by section.
- `docs/plans/` is the single plan directory (issue-level + initiative-level).
- `.claude/handoffs/` no longer exists.
- Roles: Curator and Orchestrator named in `AGENTS.md` § Roles and used directly in skill bodies.
- `arch-review` fires successfully at least once (cron OR counter), produces ≥1 candidate, candidate enters triage normally.
- One full issue cycle ships post-refactor (validation: pick a small AFK issue, run cold).

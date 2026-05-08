# Workflow Redesign Plan: Compose Lifecycle from Skills

**Status:** Draft, awaiting grill.
**Author:** CPTO (with two greenfield/conservative agent inputs and CEO direction).
**Scope:** This plan describes HOW the project's workflow will be restructured; it does not implement any of the changes. Implementation gates on grill + CEO sign-off.

---

## 1. Goal

Restructure the workflow so that:

1. **Skills are project-agnostic primitives.** Anyone could drop them into a different repo without editing the skill body.
2. **Project specifics live in four well-known artifacts:** `CONTEXT.md` (domain glossary), `AGENTS.md` (roles + skill bindings), `docs/prd/` (initiatives), `docs/adr/` (decisions).
3. **The lifecycle is composed of skill invocations**, described in a single top-level `docs/workflow.md`. That doc is the canonical "how the project ships" reference.
4. **Everything we use lives in the repo.** No global-only skills.

This addresses three observed problems:
- The current local skills (`kickoff`, `co-review`, `resume`) are tightly coupled to Deloop terminology (Linear, AWK-XX, CPTO, `pnpm check`, `main`). They're not portable, and the project-specific bits are hard to change in one place.
- The front-end of the lifecycle (raw idea → PRD → triage) and the back-end (recurring arch review) are unspecified.
- The handoff file is misnamed — it's a plan, and we want to grill plans before spawning.

---

## 2. Principles

- **Skill = primitive. Workflow = composition.** Skills don't know which workflow they're part of. The workflow knows which skills it uses.
- **Project specifics don't leak into skills.** Skills reference `AGENTS.md` for role names, tracker, branch conventions, validation commands, label vocabulary.
- **One workflow doc, not many.** `docs/workflow.md` is the entry point. `docs/agent/*.md` files become focused playbooks (testing, code-review, decision-records) — each a deep module behind a small interface.
- **Plans are first-class artifacts.** Durable plans live in `docs/plans/` (checked in, e.g. this file). Session-local plans live in `.claude/plans/` (gitignored, replaces `.claude/handoffs/`). Both are grillable.
- **Linear/GitHub/Conventional Commits/main are project-bindings, not skill assumptions.** Encoded in `AGENTS.md`, referenced by skills.

---

## 3. Target lifecycle (composed of skills)

```
[ Stage 0 — Idea ]
  Trigger:    CEO surfaces a thought, bug report, or strategic direction.
  Skill:      (none yet) — could go straight to issue or to PRD.
  Actor:      CEO + CPTO.
  Artifact:   either a Linear issue (single-scope) or kicks off Stage 1 (PRD-scope).

[ Stage 1 — PRD (multi-issue scope only) ]
  Trigger:    Initiative spans >3 issues OR introduces user-facing concept OR has cross-cutting impact.
  Skill:      /to-prd → /grill-with-docs (sharpen against CONTEXT.md, foundation.md, ADRs)
  Actor:      CPTO + CEO collaborative.
  Artifact:   docs/prd/<slug>.md (status: Draft). When milestone-assigned, gets mN- prefix.
              ADRs filed inline if decisions cross the bar.

[ Stage 2 — Decompose ]
  Trigger:    PRD reaches "Active" status with locked milestone.
  Skill:      /to-issues (vertical slices, AFK/HITL marked; emits issues with `needs-triage` label)
  Actor:      CPTO; CEO approves slice list before publish.
  Artifact:   N Linear issues, each labeled `needs-triage`, body = What + AC + Blocked-by (NO design).
              Each enters Stage 3 individually.

[ Stage 3 — Triage ]
  Trigger:    Linear issue has `needs-triage` label (entry from Stage 2 or direct issue creation).
  Skill:      /triage (calls /diagnose for bugs needing repro; /grill-with-docs for fuzzy AC)
  Actor:      CPTO.
  Output:     Issue moves to `ready-for-agent`, `ready-for-human`, `needs-info`, or `wontfix`.
  Artifact:   Triage decision as Linear comment (with AI-generated disclaimer).
              For `wontfix` enhancements: `.out-of-scope/<slug>.md` checked in.
              For `ready-for-agent`: AC sharpened, scope bounded — but NO implementation design.

[ Stage 4 — Wait ]
  Issue sits in backlog. Could be hours, days, weeks, months.
  THIS is why triage doesn't lock implementation design: the codebase moves.

[ Stage 5 — Kickoff (Session A: warm) ]
  Trigger:    CEO types `/kickoff <ID> [autonomous]` against a `ready-for-agent` issue.
  Skill:      /kickoff (Phase 1-3a)
              Phase 2 grill = /grill-with-docs in DELTA MODE against the triage-locked AC.
              Resolves only what's drifted: codebase changes, new ADRs, scope still valid.
  Actor:      CPTO.
  Artifact:   .claude/plans/<ID>.md (gitignored, session-local) — Implementer spawn prompt.
              Linear issue updated with any deltas surfaced during kickoff grill.

[ Stage 6 — /clear + Spawn (Session B: cold) ]
  Trigger:    CEO retypes `/kickoff <ID>` after /clear; cold CPTO detects the plan file.
  Skill:      /kickoff (Phase 4) — spawn Implementer with the plan file as the prompt.
  Actor:      Implementer subagent in worktree; uses /test-driven-development for new logic modules.
  Artifact:   PR with structured description per docs/agent/code-review.md.

[ Stage 7 — Review ]
  Trigger:    Implementer reports PR URL.
  Skill:      /co-review (cycles 1-2, arbitrate, merge step)
  Actor:      Reviewer subagent + CPTO arbitration.
  Artifact:   PR with `CPTO arbitration:` comments; (autonomous) `Mode: autonomous` trace.

[ Stage 8 — Merge ]
  Trigger:    Review converged + CI green.
  Skill:      /co-review Phase 4 (merge step)
  Actor:      CPTO (autonomous) or CEO (manual).
  Artifact:   merge commit; Linear → Done.

[ Stage 9 — Reflect-and-clear ]
  Trigger:    Post-merge.
  Skill:      /co-review Phase 5
  Actor:      CPTO.
  Artifact:   playbook PR (if codifiable); Linear comment (if project-state).
              Increment arch-review counter. Delete `.claude/plans/<ID>.md`.

[ Stage 10 — Recurring arch review (NEW) ]
  Trigger:    Cron (weekly) OR N-merges-since-last (default: 10) OR cycle-2 frequency signal
              OR CEO-invoked /arch-review.
  Skill:      /arch-review wraps /improve-codebase-architecture.
  Actor:      CPTO; CEO supervises (no autonomous arch reviews).
  Artifact:   Each accepted candidate filed as Linear issue with `arch-review` + `needs-triage`
              labels (re-enters Stage 3). Multi-issue refactors → docs/prd/<slug>.md.
```

---

## 4. Skill inventory and disposition

| Skill | Source today | Action | Notes |
|---|---|---|---|
| `to-prd` | global (`~/.agents/skills/`) | Copy + genericize | Already mostly generic. |
| `to-issues` | global | Copy + genericize | Already mostly generic. |
| `triage` | global | Copy + genericize + parameterize labels | Triage label vocabulary lives in `AGENTS.md`. |
| `grill-with-docs` | global | Copy as-is | Already generic. |
| `grill-me` | global | **Discard** | Strict subset of `grill-with-docs`; wrong default for a CONTEXT-rich project. |
| `diagnose` | global | Copy as-is | Already generic. |
| `test-driven-development` | global | Copy as-is | Already generic. Keep full name (TDD is too cryptic for /-invocation discoverability). |
| `improve-codebase-architecture` | global | Copy as-is | Already generic. |
| `arch-review` | NEW | Create | Thin wrapper: detects cron/counter trigger, invokes `/improve-codebase-architecture`, files candidates as Linear issues. |
| `kickoff` | local | Refactor (extract project-specifics) | Move Linear/AWK/pnpm/CPTO references to `AGENTS.md` bindings. |
| `co-review` | local | Refactor (extract project-specifics) | Same. |
| `resume` | local | Refactor (extract project-specifics) | Same. |

---

## 5. Genericization rules

For any skill in `.claude/skills/`:

| Project-specific term | Generic replacement | Source of truth |
|---|---|---|
| `Linear` / `GitHub Issues` / `Jira` | "the issue tracker" | `AGENTS.md` § Skill bindings |
| `AWK-XX` | `<issue-id>` | `AGENTS.md` § Skill bindings |
| `pnpm check` / `pnpm test` | "the project's check command" / "the project's test command" | `AGENTS.md` § Skill bindings |
| `main` | "the default branch" | `AGENTS.md` § Skill bindings |
| `<type>/awk-<n>-<topic>` | "the project's branch naming convention" | `AGENTS.md` § Skill bindings |
| `CPTO`, `Implementer`, `Reviewer`, `CEO` | "orchestrator", "implementer", "reviewer", "human partner" — OR keep generic role name and let each project map them in `AGENTS.md` § Roles | `AGENTS.md` § Roles |
| `needs-triage`, `ready-for-agent`, etc. | "the triage label vocabulary" | `AGENTS.md` § Triage labels |
| `Conventional Commits + (AWK-XX)` | "the project's commit format" | `AGENTS.md` § Commit format |
| `.claude/handoffs/<ID>.md` | `.claude/plans/<id>.md` | This plan §7 |

**Approach for role names:** the cleanest path is to keep generic role names in skill bodies (e.g., "the orchestrator") and provide a project-specific mapping table in `AGENTS.md`. Skills that need to refer to a role just say "the orchestrator runs this phase"; the reader resolves "orchestrator = CPTO" via `AGENTS.md`.

---

## 6. Target file structure

```
CONTEXT.md                          # domain glossary (exists)
AGENTS.md                           # roles + skill bindings + invariants (rewritten)

.claude/
├── plans/                          # session-local (renamed from .claude/handoffs/)
│   └── <issue-id>.md               # gitignored
├── skills/
│   ├── to-prd/SKILL.md             # copied from global
│   ├── to-issues/SKILL.md          # copied
│   ├── triage/SKILL.md             # copied + genericized
│   ├── grill-with-docs/SKILL.md    # copied
│   ├── diagnose/SKILL.md           # copied
│   ├── test-driven-development/SKILL.md  # copied
│   ├── improve-codebase-architecture/SKILL.md  # copied
│   ├── arch-review/SKILL.md        # NEW thin wrapper
│   ├── kickoff/SKILL.md            # refactored
│   ├── co-review/SKILL.md          # refactored
│   └── resume/SKILL.md             # refactored
├── state/
│   └── arch-review-counter.json    # NEW; merges-since-last-arch-review (gitignored)
└── settings.json

docs/
├── workflow.md                     # NEW: composes lifecycle from skills (top-level)
├── prd/
│   ├── foundation.md
│   ├── README.md
│   └── ...
├── adr/
│   └── ...
├── plans/
│   ├── workflow-redesign.md        # this plan (durable design plans, rare)
│   └── ...
└── agent/                          # focused playbooks (each a deep module)
    ├── testing.md                  # TDD discipline + project-specific test commands
    ├── code-review.md              # Reviewer/PR-description contract
    └── decision-records.md         # ADR policy

.out-of-scope/                      # NEW; populated by /triage wontfix-enhancement flow
└── <slug>.md
```

**Note on `docs/agent/workflow.md`:** the current file becomes obsolete (its content moves into `docs/workflow.md` and `AGENTS.md`). Delete during Phase 3.

---

## 7. `.claude/handoffs/` → `.claude/plans/` (with reasoning)

**Recommendation:** rename. Stays gitignored, stays per-issue, stays session-local — but the name better matches the role.

**Reasoning:**
- The current handoff file IS a plan: post-grill, pre-spawn, the document the Implementer reads.
- "Plan" is grillable as a concept (we'll grill THIS plan before implementing it). "Handoff" suggests it's a fait accompli — written, then passed.
- Naming converges nicely with `docs/plans/`: both directories hold *plans*, distinguished by lifetime (session-local gitignored vs durable checked-in). One vocabulary.
- The implementer-spawn-prompt is conceptually a special case of "plan." Treating it as such opens the door to grilling it before spawning, which Agent A's "delta grill" recommendation requires.

**One gotcha:** `docs/plans/` and `.claude/plans/` share a name but have very different lifecycles. We document this clearly in `AGENTS.md`:
- `docs/plans/` — durable, checked-in, rare. Used for cross-cutting design (this file).
- `.claude/plans/` — session-local, gitignored, per-issue. Used for kickoff handoffs.

---

## 8. `AGENTS.md` rewrite (skill bindings as the new core)

The current `AGENTS.md` is largely about how Deloop ships. After this refactor, much of that moves to `docs/workflow.md`. `AGENTS.md` retains:

1. **Project intro (1 paragraph)** — what is this project.
2. **Roles** — current section, mostly intact.
3. **Core invariants** — current section, mostly intact (these ARE project-specific, e.g. canvas iframe rules).
4. **Skill bindings (NEW)** — the lookup table skills use to resolve project-specifics:
   ```markdown
   ## Skill bindings

   - **Issue tracker:** Linear (via Linear MCP)
   - **Issue ID format:** AWK-<n>
   - **Default branch:** main
   - **Branch naming:** <type>/awk-<n>-<topic>
   - **Validation commands:** `pnpm check`, `pnpm test` (unit + relevant E2E)
   - **Commit format:** Conventional Commits with (AWK-XX) suffix
   - **Triage labels:** `needs-triage`, `ready-for-agent`, `ready-for-human`, `needs-info`, `wontfix`
   - **Role mapping:** orchestrator = CPTO; implementer = Implementer; reviewer = Reviewer; human partner = CEO
   ```
5. **Documentation map** — pointer to `docs/workflow.md`, `docs/prd/`, etc.

Cuts:
- Default Flow (moves to `docs/workflow.md`).
- Branch and PR Naming details (referenced from Skill bindings).
- Linear Status Lifecycle (moves to `docs/workflow.md`).
- Plans Policy (moves to `docs/workflow.md`).

---

## 9. `docs/workflow.md` (new top-level composition doc)

Structure (sketched):

```markdown
# Workflow

This document describes how work flows through this project, end to end.
Each stage names the skill that drives it. Project-specific terms (issue
tracker, branch names, role names) are defined in AGENTS.md.

## Lifecycle overview
[the diagram from §3 of the redesign plan]

## Stage 0 — Idea
[short prose, what triggers, what produces, who decides]

## Stage 1 — PRD
[short prose]
... (one section per stage)

## Modes (manual vs autonomous)
[per-issue verbal opt-in, circuit breakers]

## Plans
- docs/plans/ — durable
- .claude/plans/ — session-local
[with examples]

## Recovery
[references /resume]
```

Length target: under 500 lines. The skill bodies and `AGENTS.md` carry the detail; this doc is the map.

---

## 10. Migration phases (each is a separate PR)

**Phase 0 (this PR).** Plan only. No code/skill changes. Gates on grill + CEO sign-off.

**Phase 1.** Copy primitive skills (project-agnostic) into `.claude/skills/`:
- `grill-with-docs`, `diagnose`, `test-driven-development`, `improve-codebase-architecture`.
- These need minimal/no genericization.

**Phase 2.** Copy lifecycle skills with parameterization:
- `to-prd`, `to-issues`, `triage`. Each gets the genericization treatment per §5.

**Phase 3.** Add `arch-review` wrapper skill + counter file infrastructure.

**Phase 4.** Refactor existing local skills to use `AGENTS.md` skill bindings:
- `kickoff/SKILL.md`, `co-review/SKILL.md`, `resume/SKILL.md`.
- This is the highest-risk PR — touches the workflow we use daily.

**Phase 5.** Rename `.claude/handoffs/` → `.claude/plans/`:
- Move existing handoff files (none expected if clean).
- Update `.gitignore`.
- Update references in skills (kickoff, resume, co-review).
- Update `AGENTS.md`.

**Phase 6.** Write `docs/workflow.md`. Update `AGENTS.md` Documentation map. Delete `docs/agent/workflow.md` (or shrink to a stub redirect).

**Phase 7.** First arch-review dry run to validate the recurring loop end-to-end.

Each phase is small enough to grill, ship, and live with for a day before the next.

---

## 11. Decisions baked in (not to grill — already locked)

These come from the prior conversation and the two agent proposals; flagging them so we don't re-litigate during the grill:

- **Triage runs against an existing issue, never before issue creation.** Lifecycle: `/to-issues` (or direct issue) → `needs-triage` label → `/triage` → `ready-for-agent` → `/kickoff`.
- **Triage's grill is light (AC + terminology). Kickoff's grill is heavy (implementation design against current main).** Triage doesn't lock implementation because issues sit for weeks/months.
- **Issue body holds AC; implementation design lives in the kickoff plan and PR description, never written back to issue body.** Staleness defense.
- **`grill-me` is discarded** in favor of `grill-with-docs`. Wrong default for a CONTEXT-rich project.
- **Single CPTO, no Curator/Operator/Architect role split.** Greenfield agent proposed it; conservative agent rejected; CEO's stated preference is composition-via-skills, not role-multiplication. Defer until CPTO chokepoint is observed, not hypothesized.

---

## 12. Open questions for grilling

These are the load-bearing decisions where my recommendation is one of several reasonable answers. Default in italics.

1. **Refactor budget — soft (CEO discretion) or hard (next milestone blocks if unmet)?** *Default: soft, tracked but not enforced. Revisit after 3 milestones.*
2. **Arch-review trigger threshold — N merges?** *Default: 10. Tune based on first month's signal.*
3. **Discard `docs/agent/workflow.md` outright, or keep as project-specific addendum?** *Default: discard; everything moves to `docs/workflow.md` + `AGENTS.md`.*
4. **Keep role names (CPTO/Implementer/Reviewer/CEO) in skill bodies (with `AGENTS.md` mapping note) or use generic names (orchestrator/implementer/reviewer/human partner)?** *Default: generic names in skill bodies; mapping in `AGENTS.md`. Maximizes portability.*
5. **`docs/agent/testing.md`, `code-review.md`, `decision-records.md` — keep at `docs/agent/` or promote to `docs/`?** *Default: keep at `docs/agent/`; they're focused playbooks, not the workflow itself.*
6. **`.out-of-scope/` directory — at repo root or under `docs/`?** *Default: repo root. Per global `triage` skill convention; matches `.claude/`.*
7. **`/test-driven-development` invocation — full name or `/tdd` shortcut?** *Default: keep full name. Skill discoverability via `/` autocomplete > brevity.*
8. **`arch-review` Linear label — does it exist yet?** *Default: create as part of Phase 3.*
9. **Does this plan itself need an ADR?** *Default: no. Plan is the artifact; ADRs land for specific architectural decisions surfaced during grill (e.g. "skills must be project-agnostic" might warrant one).*
10. **Phase 4 (refactor existing skills) — single PR or split per skill?** *Default: split per skill, three PRs. Lower blast radius.*

---

## 13. Risks

1. **Skill drift between local copies and global originals.** Once we copy global skills into `.claude/skills/`, upstream improvements don't flow in automatically. Mitigation: document the "last-synced-commit" of the global skill in a comment at the top of each local copy; periodically diff.
2. **Genericization may sand off useful sharpness.** Generic skill bodies might be less effective than ones that name "Linear" directly. Mitigation: skills reference `AGENTS.md` by *concrete section heading* (e.g. "see AGENTS.md § Skill bindings → Issue tracker") so the indirection is one hop, not abstract.
3. **Migration cost is real and lands during active feature work.** Each phase touches files we use daily. Mitigation: phased PRs, dogfood between each, hold rollback option.
4. **Two `plans/` directories will confuse newcomers** despite the AGENTS.md note. Mitigation: ensure the gitignored one has a placeholder README explaining lifetime difference.
5. **`arch-review` counter is fragile** — gitignored state file. Cron is the backstop. Mitigation accepted; document explicitly.
6. **Triage as a chokepoint.** If CEO drops 10 ideas in one session, CPTO bottlenecks. Mitigation: `needs-info` is back-pressure; deferred-triage is a valid state.

---

## 14. Out of scope (for this plan)

- Splitting CPTO into Curator/Operator/Architect (deferred — see §11).
- Hard refactor budget enforcement (deferred — see §12.1).
- Migrating `docs/prd/` or `docs/adr/` content (no changes to those directories).
- Project-specific skill changes that don't relate to the genericization (e.g. tweaking kickoff Phase 2 grill content beyond delta-mode reframing — that's a separate scope).
- Multi-context (`CONTEXT-MAP.md`) support. Deloop is single-context.

---

## 15. Done criteria for the redesign as a whole

- All skills used in the workflow live under `.claude/skills/` with project-agnostic bodies.
- `AGENTS.md` § Skill bindings is the single lookup for project-specific terms.
- `docs/workflow.md` exists, ≤500 lines, references skills by name and `AGENTS.md` by section.
- `.claude/plans/` is the session-local plan dir; `.claude/handoffs/` no longer exists.
- `arch-review` fires successfully at least once (cron OR counter), produces at least one candidate, candidate enters triage normally.
- Existing kickoff/co-review/resume flow continues to work end-to-end through one full issue cycle post-refactor (validation: pick a small AFK issue and run it cold).

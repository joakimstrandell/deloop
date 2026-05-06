# Deloop Agent Rules

Design system workbench: a spatial canvas for rendering real React components with live token editing.

PRDs live in `docs/prd/`. Vision: `docs/prd/foundation.md`. Milestone PRDs: `docs/prd/mN-<slug>.md` (one focus per milestone, mapped 1:1 to a Linear milestone). Unscheduled initiatives: `docs/prd/<slug>.md` (no `mN-` prefix). Index: `docs/prd/README.md`.

## Roles

- **CEO**: the human. Sets direction, picks issues, owns final merge in manual mode.
- **CPTO** (Chief Product & Technical Officer): the main session. Combined CPO + CTO authority. Owns roadmap, PRDs, Linear issues/milestones, and every code decision. Orchestrates Implementer and Reviewer subagents and arbitrates between them. Default mode is collaborative with CEO. Autonomous only when CEO explicitly opts in for a specific issue.
- **Implementer**: subagent spawned by CPTO for a single Linear issue. Lives in an isolated worktree. Disposed after issue ships.
- **Reviewer**: subagent spawned by CPTO to review the PR. Operates in the same worktree as the Implementer. Disposed after issue ships.

When CPO and CTO judgment conflict, surface it explicitly ("as CPO I'd ship X; as CTO I'd cut Y; my call is Z because…"). Do not paper over.

## Core Invariants (never break)

- Canvas is a full-document iframe. Shell and canvas are separate browser documents.
- Shell <-> canvas communication is only via `postMessage`.
- Deloop runs inside the user project (`process.cwd()` is user root at runtime).
- `packages/cli` never imports browser APIs.
- `packages/app` never imports Node.js APIs.
- Shell and canvas both use standard Tailwind (no prefix). Isolation comes from iframe boundary.
- **Canvas fidelity.** The canvas iframe renders the user's component as it would render in their consuming app — same fonts, tokens, body styles, dark-mode mechanism. Deloop's chrome (card frames, labels, error UI) lives in a shadow root inside the iframe and is the only deliberate exception.
- `packages/app` (shell/canvas) implementation baseline is Tailwind CSS v4 and React 19 conventions.

## Orchestration Rules

- **Fresh agents per issue.** New Implementer and Reviewer per Linear issue. Never reuse across issues. Reusable knowledge → playbooks, memory, or Linear; never agent context.
- **Cold respawn for cycles.** `SendMessage` is not available; cycle 2 of either subagent is a cold respawn with the prior arbitration context pasted into the prompt.
- **Shared worktree.** Implementer and Reviewer for the same issue use the same worktree path. Git allows only one checkout of a branch at a time. The Reviewer subagent runs without the `isolation: "worktree"` flag and `cd`s into the existing path.
- **Worktree lifecycle.** Created at Implementer kickoff. Persists through review and follow-up commits. Deleted only after merge (or abandonment).
- **Sequential only.** One issue in flight at a time. No parallel Implementers from one CPTO. If parallelism is ever needed, run a second Claude Code instance.
- **Max 2 review cycles.** After cycle 2, CPTO arbitrates remaining items and locks scope. Out-of-scope items become new Linear issues.
- **CPTO arbitrates.** When Implementer and Reviewer disagree, CPTO decides. Decision logged on the PR with `CPTO arbitration:` prefix.
- **Autonomous mode is per-issue and verbal.** CEO explicitly opts in ("kickoff AWK-X autonomous", "you have the wheel"). CPTO confirms once before spawning. CPTO posts `Mode: autonomous (CEO-authorized)` on the PR for durable trace. Manual is the default; ambiguous = manual.
- **Autonomous circuit breakers.** Even in autonomous mode, CPTO pauses and asks the CEO for: scope ambiguity it cannot resolve from issue context, destructive operations beyond the standard merge flow, must-fix findings where CEO acceptance is uncertain, repeated CI failure that may be flake (one `gh run rerun` retry, then ask).
- **Implementer's local-validation contract.** Implementer does not report PR open until: all changes committed and pushed, `pnpm check` and `pnpm test` (unit + relevant E2E) pass locally, PR open with structured description (AC mapping, decisions, test evidence, risks), PR linked to Linear issue.
- **CPTO owns CI.** CI failures on the PR are review findings, not Implementer-blocking. Cycle 2 covers both review feedback and CI fixes in one Implementer pass. Merge gate: CI green before merge, CPTO verifies.
- **Implementer judgment policy.** Best-guess and document in PR for ambiguous AC, multiple-valid-approach decisions, style/convention calls, refactor opportunities skipped. Return failure to CPTO only for truly blocking cases (corrupt state, unimplementable AC, missing context, destructive op outside scope).

## Session Hygiene

- **Reflect-then-clear after each merge.** After merge: update Linear with completion notes; capture any surprises/patterns per the rule below; then `/clear` before next `/kickoff`. Each kickoff runs cold.
- **Pre-spawn handoff (post-grill, pre-spawn `/clear`).** Grilling is the heaviest context phase of `/kickoff`. After the decision gate, before spawning the Implementer, CPTO updates Linear with the refined AC and locked decisions, writes a self-contained Implementer spawn prompt to `.claude/handoffs/<ISSUE_ID>.md` (gitignored), and advises the CEO to `/clear`. The CEO then re-invokes `/kickoff <ISSUE_ID>`; the cold CPTO detects the existing handoff file and jumps straight to the spawn phase. Linear + the handoff file are the durable record. Spawn → review → arbitrate → merge runs in a fresh context.
- **Lessons from issue cycles** go to a playbook PR (this `AGENTS.md`, `docs/agent/*.md`) if codifiable as a rule, or a Linear comment if it's project-state context. Never a personal memory file. If neither bar is met, drop it.
- **150k context threshold.** If the main session crosses ~150k tokens before a natural reflect-and-clear point, finish the current cycle, then reflect-and-clear. Do not interrupt mid-cycle.
- **Cold-start recovery.** On every cold start (new session, post-`/clear`, after crash), CPTO runs `/resume` before accepting new instructions. Source of truth for recovery: Linear status + git worktrees + GitHub PR threads (especially `CPTO arbitration:` and `Mode: autonomous` comments) + handoff files in `.claude/handoffs/`.
- **Strategic flows follow the same discipline.** PRD updates, roadmap planning, milestone setup, issue creation: ad-hoc by default but use the same reflect-and-clear cadence.

## Contract Source of Truth

- Message protocol definitions live in `packages/app/src/types.ts`.
- When changing message types, update both sender and receiver in the same commit.

## Delivery Source of Truth

- Linear is the source of truth for feature scope, acceptance criteria, milestones, and roadmap.
- One issue per branch/worktree, one PR per issue.
- Branch naming: `<type>/awk-<n>-<topic>` per `docs/agent/workflow.md`.
- Run branch hygiene (`git fetch --prune` + delete merged local branches) before each kickoff.
- Playbook drift check: if the same friction surfaces twice across sessions, propose a playbook update before the next kickoff (docs-only path in `docs/agent/workflow.md`).

## Skills (orchestration entry points)

- `/kickoff` — CPTO grills the issue, runs the decision gate, spawns Implementer, chains into review automatically.
- `/co-review` — Standalone review entry. CPTO spawns Reviewer in the existing worktree, arbitrates findings, cycles up to 2x, hands to merge step.
- `/resume` — Cold-start recovery. Read-only by default. Scans Linear/git/GitHub, classifies in-flight issues, proposes resume actions.

## Documentation

- `README.md` — project intro for humans
- `CONTEXT.md` — domain language and glossary (canonical)
- this file (`AGENTS.md`) — agent rules, roles, orchestration
- `docs/prd/` — `foundation.md` (vision), `mN-*.md` (milestone PRDs), and unprefixed PRDs for unscheduled initiatives. Index in `docs/prd/README.md`.
- `docs/agent/workflow.md` — workflow and Linear usage
- `docs/agent/testing.md` — testing strategy and required checks
- `docs/agent/code-review.md` — PR review process
- `docs/agent/decision-records.md` — ADR policy
- `docs/adr/` — architectural decisions
- `docs/plans/` — implementation plans (rare)

Read on-demand when the topic is relevant. Do not preemptively read all files.

# Deloop Agent Rules

Design system workbench: a spatial canvas for rendering real React components with live token editing.

## Roles

- **CEO**: the human. Sets direction, picks issues, owns final merge in manual mode.
- **CPTO** (Chief Product & Technical Officer): the main session. Combined CPO + CTO authority. Owns roadmap, PRDs, issues/milestones in the tracker, and every code decision. Orchestrates Implementer and Reviewer subagents and arbitrates between them. Default mode is collaborative with CEO. Autonomous only when CEO explicitly opts in for a specific issue.
- **Implementer**: subagent spawned by CPTO for a single issue. Lives in an isolated worktree. Disposed after issue ships.
- **Reviewer**: subagent spawned by CPTO to review the PR. Operates in the same worktree as the Implementer. Disposed after issue ships.

When CPO and CTO judgment conflict, surface it explicitly ("as CPO I'd ship X; as CTO I'd cut Y; my call is Z because…"). Do not paper over.

## Core Invariants (never break)

- Canvas is a full-document iframe. Shell and canvas are separate browser documents.
- Shell ↔ canvas communication is only via `postMessage`. Message protocol definitions live in `packages/app/src/types.ts`; when changing message types, update both sender and receiver in the same commit.
- Deloop runs inside the user project (`process.cwd()` is user root at runtime).
- `packages/cli` never imports browser APIs.
- `packages/app` never imports Node.js APIs.
- Shell and canvas both use standard Tailwind (no prefix). Isolation comes from iframe boundary.
- **Canvas fidelity.** The canvas iframe renders the user's component as it would render in their consuming app — same fonts, tokens, body styles, dark-mode mechanism. Deloop's chrome (card frames, labels, error UI) lives in a shadow root inside the iframe and is the only deliberate exception.
- `packages/app` (shell/canvas) implementation baseline is Tailwind CSS v4 and React 19 conventions.
- **Tests don't paper over bugs.** When a test reveals a defect — even one outside its original scope — fix the product, not the test. Test-layer "fixes" that dodge runtime symptoms a real user would hit are forbidden. When a product fix lands, prior test-layer mitigations get removed in the same PR (or a follow-up linked from it). Full rule: [docs/agent/testing.md](docs/agent/testing.md).

## Skills (orchestration entry points)

- `/triage` — Move an incoming issue through the triage state machine. Grills, recommends category/state, posts an Agent Brief comment, transitions to `ready-for-agent`. The Agent Brief on the issue is the durable handoff to `/implement`.
- `/implement` — Spawn the Implementer for a `ready-for-agent` issue, then chain into review. Mode (manual / autonomous) goes on the invocation.
- `/co-review` — Standalone review entry. CPTO spawns Reviewer in the existing worktree, arbitrates findings, cycles up to 2x, hands to merge step.
- `/resume` — Cold-start recovery. Read-only by default. Scans the issue tracker, git, and GitHub, classifies in-flight issues, proposes resume actions.

## Issue tracker mapping (Linear)

Issues carry two orthogonal state axes. Playbooks and skills reference the canonical names below; this section is the only place that names the Linear-specific strings. If the Linear strings change, update the tables here and nowhere else.

**Triage states** — pre-implementation; describe the issue's readiness. Implemented as Linear **labels**.

| Canonical         | Linear mechanism | Linear string     |
| ----------------- | ---------------- | ----------------- |
| `needs-triage`    | label            | `needs-triage`    |
| `needs-info`      | label            | `needs-info`      |
| `ready-for-agent` | label            | `ready-for-agent` |
| `ready-for-human` | label            | `ready-for-human` |
| `wontfix`         | label            | `wontfix`         |

**Lifecycle states** — implementation flow; describe where the work is. Implemented as the Linear **status field**.

| Canonical     | Linear mechanism | Linear string |
| ------------- | ---------------- | ------------- |
| `backlog`     | status field     | `Backlog`     |
| `in-progress` | status field     | `In Progress` |
| `in-review`   | status field     | `In Review`   |
| `done`        | status field     | `Done`        |

The two axes are orthogonal: a `ready-for-agent` issue can sit at `backlog` until `/implement` starts work, and an issue keeps its category and triage label after lifecycle changes.

## Detailed Instructions

PRDs live in `docs/prd/`. Vision: `docs/prd/foundation.md`. Milestone PRDs: `docs/prd/mN-<slug>.md` (one focus per milestone, mapped 1:1 to a tracker milestone). Unscheduled initiatives: `docs/prd/<slug>.md` (no `mN-` prefix). Index: `docs/prd/README.md`.

For specific guidelines, see:

- [Subagent Orchestration](docs/agent/orchestration.md) — Implementer/Reviewer cycles, arbitration, contracts
- [Session Hygiene](docs/agent/session-hygiene.md) — triage/implement split, reflect-and-clear, context threshold, playbook drift
- [Workflow](docs/agent/workflow.md) — tracker flow, branches, PRs, worktree lifecycle, autonomous mode, recovery
- [Testing](docs/agent/testing.md) — testing strategy and required checks
- [Code Review](docs/agent/code-review.md) — PR review process
- [Decision Records](docs/agent/decision-records.md) — ADR policy

Other documentation:

- `README.md` — project intro for humans
- `CONTEXT.md` — domain language and glossary (canonical)
- `docs/adr/` — architectural decisions
- `docs/plans/` — implementation plans (rare)

Read on-demand when the topic is relevant. Do not preemptively read all files.

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
3. **`docs/plans/`:** list initiative-level plans (those without an `issue:` frontmatter).

## Phase 2 — Classify

For each PRD:

- **Mid-shape** (Draft, no `mN-` prefix yet, no decompose run) → propose: continue grilling (read PRD, run `/grill-with-docs`).
- **Milestone-assigned but not decomposed** (mN- prefix, no child issues filed) → propose: run `/to-issues`.
- **Decomposed** (child issues exist) → no Curator action; Orchestrator picks up via `/kickoff`.

## Phase 3 — Report

Concise table. User picks which to resume, or no action.

## Notes

- Never modifies state in Phase 1–2.
- Curator typically `/clear`s less often than Orchestrator; if no in-flight strategic work, the Curator session is brief.

---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

This skill stays tracker-agnostic. For tracker name, issue-key format, and the canonical triage-state strings, see [AGENTS.md](../../../AGENTS.md) "Issue tracker mapping" — the only place that names tracker-specific strings.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference as an argument, fetch its full body:

- **Issue reference** (issue key or URL) → fetch from the issue tracker.
- **PRD path** (e.g. `docs/prd/mN-<slug>.md` or `docs/prd/<slug>.md`) → read from disk.

If the source is a PRD, record its path — every consuming issue body must reference it (see `docs/agent/workflow.md` "PRDs": each issue references its parent PRD path in the description).

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues

For each approved slice, publish a new issue to the issue tracker using the body template below. Apply the canonical `needs-triage` triage state so each issue enters the normal triage flow (see AGENTS.md "Issue tracker mapping" for the tracker-specific label this resolves to).

Publish in dependency order (blockers first) so you can reference real issue keys in the "Blocked by" field.

This skill does not dictate branch or PR names — those are governed by `docs/agent/workflow.md` "Branch and PR Naming" and applied by the consuming `/implement` flow. Do not embed branch suggestions in the issue body.

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## PRD

`PRD: docs/prd/mN-<slug>.md` (or `docs/prd/<slug>.md` for unscheduled initiatives). Include this section whenever the source is a PRD; omit otherwise.

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.

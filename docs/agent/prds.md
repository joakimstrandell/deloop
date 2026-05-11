# PRD Policy

## Purpose

PRDs describe _what_ and _why_ for a coherent product initiative. The _how_ lives in the issue itself (description + Agent Brief comment, see [workflow.md](workflow.md#plans-policy)); ADRs (`docs/adr/`) capture decision rationale.

## When to Write a PRD

Write a PRD when the initiative:

- spans more than ~3 issues in the tracker,
- introduces a user-facing concept, or
- has cross-cutting architectural impact.

Below that threshold, the issue description in the tracker suffices.

## Layout

PRDs live in `docs/prd/`:

- **`foundation.md`** — vision, positioning, mode taxonomy, language. Read this first.
- **`mN-<slug>.md`** — milestone-aligned PRDs. One focus per milestone, one PRD per milestone, mapped 1:1 to a tracker milestone of the same number. Numbered in the planned execution order.
- **`<slug>.md`** (no prefix) — initiatives that exist as a defined scope but are not currently scheduled to a milestone.

## Conventions

- **Naming.** `mN-<slug>.md` for milestone PRDs (e.g. `m2-screens.md`); bare `<slug>.md` for unscheduled initiatives. The `mN-` prefix maps to the tracker milestone of the same number.
- **One focus per milestone.** Each `mN-` PRD covers one coherent focus area. If scope grows, split into a follow-up milestone (`mN+1`) rather than bundling.
- **Issue linkage.** Each consuming issue references its parent PRD path in the issue description (e.g. `PRD: docs/prd/m2-screens.md`).
- **Status field.** `Draft` | `Active` | `Shipped` | `Archived`. Update inline as the initiative moves. `Draft` needs `/grill-with-docs` to sharpen; `Active` is grilled and ready for execution (filename signals scheduled `mN-` vs unscheduled); `Shipped` and `Archived` are terminal. "In flight" is read from the tracker milestone, not here.
- **Cross-references to ADRs.** PRDs reference ADRs by name and link only — never restate the ADR's rationale inline. Decision lines should read `**<short name>** — see ADR-NNNN.` ADR rationale stays in the ADR; PRDs describe what + why for the milestone, not why we picked option Y over Z.
- **PRD scope is an invariant, not a snapshot.** A milestone PRD's User Stories and Implementation Decisions describe what the milestone delivers; Out of Scope describes what it does not. Both must stay accurate throughout the milestone's lifecycle. Issue-level granularity (IDs, splits, AC tweaks) lives in the tracker; milestone-level shape lives in the PRD. See `docs/agent/workflow.md` for the grill → milestone-assign → decompose → mutate → sync lifecycle.

## Template

```md
# <Title>

Status: Draft | Active | Shipped | Archived

## Problem Statement

## Solution

## User Stories

## Implementation Decisions

## Testing Decisions

## Out of Scope

## Further Notes
```

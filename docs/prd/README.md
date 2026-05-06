# PRDs

Product requirement documents for Deloop. Each PRD describes _what_ and _why_ for a coherent product initiative; _how_ lives in `docs/plans/`, decision rationale lives in `docs/adr/`.

## Layout

- **`foundation.md`** — vision, positioning, mode taxonomy, language. Read this first.
- **`mN-<slug>.md`** — milestone-aligned PRDs. One focus per milestone, one PRD per milestone, mapped 1:1 to a Linear milestone. Numbered in the planned execution order.
- **`<slug>.md`** (no prefix) — initiatives that exist as a defined scope but are not currently scheduled to a milestone.

## Active

| File                                                       | Status            | Scope                                                                |
| ---------------------------------------------------------- | ----------------- | -------------------------------------------------------------------- |
| [foundation.md](foundation.md)                             | Active            | Vision, positioning, mode taxonomy, language.                        |
| [m0-spatial-canvas.md](m0-spatial-canvas.md)               | Active (in flight) | Discovery, canvas, drag-drop, pseudo-states, Pages, HMR, persistence. |
| [m1-component-preview.md](m1-component-preview.md)         | Draft             | Mode-switcher chassis + per-component variant/state grid.            |
| [m2-screens.md](m2-screens.md)                             | Draft             | Design-in-code mode with Tailwind-first inspector and write-back.    |
| [m3-tokens-and-themes.md](m3-tokens-and-themes.md)         | Draft             | DTCG tokens, live editing, themes, build outputs.                    |
| [app-views.md](app-views.md)                               | Unscheduled       | Embedded running apps with token / theme injection.                  |

## Conventions

- **Naming.** `mN-<slug>.md` for milestone PRDs (e.g. `m2-screens.md`); bare `<slug>.md` for unscheduled initiatives. The `mN-` prefix maps to the Linear milestone of the same number.
- **One focus per milestone.** Each `mN-` PRD covers one coherent focus area. If scope grows, split into a follow-up milestone (`mN+1`) rather than bundling.
- **When to write a PRD.** Initiative spans more than ~3 Linear issues, introduces a user-facing concept, or has cross-cutting architectural impact. Below that threshold, the Linear issue description suffices.
- **Issue linkage.** Each consuming Linear issue references its parent PRD path in the issue description (e.g. `PRD: docs/prd/m2-screens.md`).
- **Status field.** Draft | Active | Active (in flight) | Shipped | Unscheduled | Archived. Update inline as the initiative moves.
- **Cross-references to ADRs.** PRDs reference ADRs by name and link only — never restate the ADR's rationale inline. Decision lines should read `**<short name>** — see ADR-NNNN.` ADR rationale stays in the ADR; PRDs describe what + why for the milestone, not why we picked option Y over Z.
- **PRD scope is an invariant, not a snapshot.** A milestone PRD's Scope and Out-of-scope sections must accurately describe what the milestone delivers throughout its lifecycle. Issue-level granularity (IDs, splits, AC tweaks) lives in Linear; milestone-level shape lives in the PRD. See `docs/agent/workflow.md` for the grill → milestone-assign → decompose → mutate → sync lifecycle.

## Template

```md
# <Title>

Status: Draft | Active | Shipped | Unscheduled | Archived
Created: YYYY-MM-DD
Updated: YYYY-MM-DD
Linear: <milestone or initiative link, if any>
Depends on: <prior milestones or PRDs, if any>

## Problem

## Goals

## Non-goals

## Scope

## Success criteria

## Open questions

## Decisions

## Out of scope (this milestone)

## Linked ADRs / Plans
```

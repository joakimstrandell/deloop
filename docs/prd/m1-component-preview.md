# M1 — Component Preview

Status: Draft
Created: 2026-05-06
Updated: 2026-05-06
Linear: M1 Component Preview (to be created)
Depends on: M0 Spatial Canvas

## Problem

The spatial canvas (M0) is great for arranging components and combinations side-by-side, but two recurring jobs are awkward inside it:

1. **Evaluating one component across many states.** "I just edited Button — show me every variant × every pseudo-state in a clean grid so I can see them all at once." Doing this manually on the spatial canvas means dragging Button on, duplicating it, configuring each card's props/pseudo-states by hand. Friction every time.
2. **Surfacing a focused single-component view from the sidebar.** Clicking a component in the sidebar today is a no-op (or drags). A natural affordance is "click the component to see it on its own canvas."

M1 solves both with a dedicated **Component Preview** mode: a per-component canvas where the user picks variants and pseudo-states from a panel and the tool renders a structured grid of Cards.

M1 also lands the **mode-switcher chassis** that M2 (Screens) and a future Apps mode build on. The chassis is small in M1 (Pages + Components) but is the structural change that lets later milestones add segments without re-architecting.

## Goals

- Provide a focused per-component view that auto-arranges Cards across variants and pseudo-states.
- Make the variant set user-driven, not auto-enumerated, to avoid combinatorial explosion on components with many props.
- Land the mode-switcher chassis as a top-bar segmented control, with `Pages` and `Components` as the V1 segments.
- Land the right-sidebar tabbed-panel chassis (ADR-0009) with `Props` as the V1 tab; M2 adds the `Style` tab without re-architecting.
- Reuse the existing prop inference (M0 / AWK-16) and pseudo-state forcing (M0) — no new infrastructure for variants.

## Non-goals

- Not a replacement for the spatial canvas — Pages mode remains the place for free arrangement and multi-component composition.
- Not the M2 Screens inspector. The right sidebar in Components mode is the existing prop controls, not the Tailwind-aware inspector.
- Not auto-enumerating prop combinations. The user picks which variants and states to show.
- Not adding new modes beyond Pages and Components in M1. Screens (M2) and Apps (unscheduled) come later.

## Scope

### Mode-switcher chassis

A top-bar segmented control exposes Deloop's modes (ADR-0006). M1 ships two segments:

- **Pages** — the existing spatial canvas (M0).
- **Components** — Component Preview (this milestone).

Per-mode state is persisted independently:

- Pages mode owns its current page, zoom/pan, and Card layout (existing `canvas.json` shape extended to nest under a `pages` key).
- Components mode owns the currently-selected Component entry and the chosen variant/state set.

Mode switching preserves both mode states — switching from Components back to Pages restores the prior page and viewport.

### Right-sidebar panel chassis

A tabbed panel chassis (ADR-0009) hosts mode-specific content. M1 ships one tab:

- **Props** — variant picker, pseudo-state picker, and shared values for non-union props (the existing M0 prop controls, lifted into the tab).

Per-mode default tab and visible tab set:

- Pages mode and Components mode show `Props` only.
- Screens mode (M2) adds and defaults to `Style`; whether `Props` is also visible in Screens defers to AWK-16's nested-prop-editing direction.

When only one tab is visible in the active mode, the tab strip is hidden — the panel shows that tab's content directly. Per-tab state is preserved across mode switches.

### Components mode

When `Components` is the active mode:

- The left sidebar is the same Component entry list as Pages mode, but clicking a component **selects** it for preview rather than starting a drag.
- The canvas renders a structured grid of Cards for the selected component. Each Card is one (variant × state) combination.
- The right sidebar exposes:
  - **Variant picker** — checkboxes / pills for each prop union value the inferred schema exposes (e.g. `variant: "primary" | "secondary"`, `size: "sm" | "md" | "lg"`).
  - **Pseudo-state picker** — checkboxes for each pseudo-state (default, hover, focus, focus-visible, active, disabled).
  - **Other props** — for non-union props, a single shared value used across all Cards in the grid (booleans toggle, numbers / strings via the existing controls). This keeps the grid focused on the variant/state axes.

The grid layout is auto-arranged — rows by variant, columns by state, or vice versa. No manual positioning in Components mode.

### Empty state

When no Component is selected (e.g. on first switch to Components mode), the canvas shows an empty state inviting the user to pick a component from the sidebar.

### Selection persistence

The selected component for Components mode is persisted in `canvas.json` — switching to Components mode after a restart restores the last-viewed component.

## Success criteria

- The top bar shows a `Pages | Components` segmented control. Clicking a segment switches modes.
- Switching from Pages to Components and back preserves both modes' state.
- In Components mode, clicking `Button` in the sidebar renders a grid with one Card per (selected variant × selected state).
- Toggling a variant in the right sidebar adds/removes the corresponding Card row from the grid.
- Toggling a pseudo-state adds/removes the corresponding Card column.
- The grid auto-arranges with consistent gaps; Cards do not need manual positioning.
- Closing and reopening Deloop restores the last-viewed component in Components mode.

## Open questions

- **Grid axis defaults.** Variant on rows, state on columns? Or the inverse? Probably configurable, but V1 needs one default.
- **Components with no variants.** A Button with no `variant` union is just one Card per pseudo-state. A component with no union props _and_ default pseudo-state only is one Card. The mode should still be useful — how does the empty-variant case render?
- **Multiple union props.** A component with `variant` × `size` × `tone` has 3 axes, not 2. V1 grid is 2D — picks the two axes with the most distinct values? Or the user picks which two? Probably the latter.
- **Relationship to AWK-16 follow-up.** The Components mode controls today live above the Screens inspector design. If AWK-16's follow-up makes the props panel selectable per-instance (nested-prop-editing), Components mode and Screens mode share that panel architecture. Decide before either ships in detail.

## Decisions

- **2026-05-06** — Mode chassis lands in M1. M0 stays single-mode (Pages); M1 introduces the segmented control with Pages and Components segments. M2 / unscheduled add segments without rearchitecting (ADR-0006).
- **2026-05-06** — Right-sidebar tabbed-panel chassis lands in M1 with `Props` as the V1 tab; M2 adds the `Style` tab (ADR-0009). Mirrors the mode-switcher chassis pattern; closes the right-sidebar architecture question that M1 and M2 both flagged.
- **2026-05-06** — User picks the variant set; no auto-enumeration. Avoids combinatorial explosion on components with many props.

## Out of scope (M1)

- Screens segment (M2) and the inspector — M1 ships only the chassis with two segments.
- Apps segment (unscheduled).
- Manual Card arrangement in Components mode — grid is auto-arranged in V1.
- Per-Card prop overrides in the grid — the variant axes drive props uniformly across the grid; ad-hoc per-Card overrides belong in Pages mode.
- Documentation / annotation for components (a separate concern, possibly future milestone).

## Linked ADRs / Plans

- [ADR-0006](../adr/0006-mode-taxonomy.md) — mode taxonomy this milestone implements.
- [ADR-0009](../adr/0009-right-sidebar-tabbed-panel-chassis.md) — right-sidebar tabbed-panel chassis this milestone ships.
- [AWK-16](https://linear.app/awkwardgroup/issue/AWK-16/typescript-prop-inference-and-props-panel) — prop inference and panel architecture; shared with M2 inspector.
- `docs/prd/m0-spatial-canvas.md` — the surface this milestone augments.
- `docs/prd/m2-screens.md` — the third mode that builds on this chassis.

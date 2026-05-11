# M1 — Component Preview

Status: Draft

## Problem Statement

The spatial canvas (M0) is great for arranging components and combinations side-by-side, but two recurring jobs are awkward inside it:

1. **Evaluating one component across many states.** "I just edited Button — show me every variant × every pseudo-state in a clean grid so I can see them all at once." Doing this manually on the spatial canvas means dragging Button on, duplicating it, configuring each card's props/pseudo-states by hand. Friction every time.
2. **Surfacing a focused single-component view from the sidebar.** Clicking a component in the sidebar today is a no-op (or drags). A natural affordance is "click the component to see it on its own canvas."

M1 solves both with a dedicated **Component Preview** mode: a per-component canvas where the user picks variants and pseudo-states from a panel and the tool renders a structured grid of Cards.

M1 also lands the **mode-switcher chassis** that M2 (Screens) and a future Apps mode build on. The chassis is small in M1 (Pages + Components) but is the structural change that lets later milestones add segments without re-architecting.

## Solution

Deloop gains a top-bar segmented mode-switcher (Pages | Components) and a tabbed right-sidebar panel chassis. The Components segment opens a per-component canvas: clicking a Component entry in the sidebar selects it for preview, and Deloop auto-arranges a grid of Cards across the variants and pseudo-states the user picks. The variant picker, pseudo-state picker, and shared values for non-union props live in the Props tab. M0's spatial canvas continues to live behind the Pages segment, with its own mode state preserved across mode switches. Selection persists across restarts.

In Components mode, clicking `Button` in the sidebar renders a grid with one Card per (selected variant × selected state). Toggling a variant in the right sidebar adds/removes the corresponding row; toggling a pseudo-state adds/removes the corresponding column. The grid auto-arranges with consistent gaps; no manual positioning. Closing and reopening Deloop restores the last-viewed component.

## User Stories

- As a developer, I want a top-bar `Pages | Components` segmented control, so that I can switch between the spatial canvas and per-component preview without losing either mode's state.
- As a developer, I want to click a Component entry in the sidebar (Components mode) to open its preview, so that I get a focused per-component view from a familiar gesture.
- As a developer, I want a variant picker (checkboxes / pills per prop union value, e.g. `variant: "primary" | "secondary"`, `size: "sm" | "md" | "lg"`) in the right sidebar, so that I choose which variants make the grid.
- As a developer, I want a pseudo-state picker (default, hover, focus, focus-visible, active, disabled), so that I choose which states make the grid.
- As a developer, I want non-union props to share a single value across the grid via the existing M0 controls (boolean toggles, numbers, strings), so that the variant/state axes drive the comparison.
- As a developer, I want the grid auto-arranged (rows by variant, columns by state, or vice versa), so that I do not have to position Cards manually in Components mode.
- As a developer, I want the empty state to invite me to pick a component from the sidebar when nothing is selected, so that the mode is discoverable on first switch.
- As a developer, I want my last-viewed Component remembered across restarts, so that Components mode restores where I left off.
- As a developer, I want switching between Pages and Components to preserve both modes' state, so that I can move between them freely.

## Implementation Decisions

- **Mode taxonomy and chassis** — see ADR-0006. M1 ships two segments (Pages, Components). M0 stays single-mode; M2 / unscheduled add segments without rearchitecting.
- **Right-sidebar tabbed-panel chassis** — see ADR-0009. M1 ships one tab (`Props`) hosting the variant picker, pseudo-state picker, and shared values for non-union props (the existing M0 prop controls, lifted into the tab). M2 adds the `Style` tab. When only one tab is visible in the active mode, the tab strip is hidden — the panel shows that tab's content directly. Per-tab state is preserved across mode switches.
- **Per-mode state, persisted independently.** Pages mode owns its current Page, zoom/pan, and Card layout (existing `canvas.json` shape extended to nest under a `pages` key). Components mode owns the currently-selected Component entry and the chosen variant/state set. Mode switching preserves both mode states.
- **Per-mode default tab and visible tab set.** Pages and Components modes show `Props` only. Screens mode (M2) adds and defaults to `Style`; whether `Props` is also visible in Screens — for selecting a nested project-component instance — defers to M2 design.
- **User picks the variant set; no auto-enumeration.** Avoids combinatorial explosion on components with many union props.
- **Reuse M0 infrastructure.** Prop inference and pseudo-state forcing (both M0) carry over unchanged — no new infrastructure for variants.
- **Sidebar gesture.** In Components mode, the left sidebar is the same Component-entry list as Pages mode, but clicking a component selects it for preview rather than starting a drag.

## Testing Decisions

- **Unit** — variant/state set parsing, grid layout calculation, per-mode state shape transformations.
- **Integration** — mode switch preserving both modes' state; tab-visibility logic; selection persistence across reload.
- **E2E** — segmented control switching, sidebar click → grid render, variant/state toggle adding/removing the corresponding row/column, restart restoring the last-viewed component.

See [docs/agent/testing.md](../agent/testing.md).

## Out of Scope

- Screens segment (M2) and the Inspector — M1 ships only the chassis with two segments.
- Apps segment (unscheduled).
- Manual Card arrangement in Components mode — grid is auto-arranged in V1.
- Per-Card prop overrides in the grid — variant axes drive props uniformly across the grid; ad-hoc per-Card overrides belong in Pages mode.
- Replacement for the spatial canvas — Pages mode remains the place for free arrangement and multi-component composition.
- Substitute for the M2 Screens Inspector — the right sidebar in Components mode is the existing prop controls, not the Tailwind-aware inspector.
- Auto-enumerating prop combinations.
- New modes beyond Pages and Components in M1.
- Documentation / annotation for components (a separate concern, possibly future milestone).

## Further Notes

- **Grid axis defaults.** Variant on rows, state on columns? Or the inverse? Probably configurable, but V1 needs one default.
- **Components with no variants.** A Button with no `variant` union is just one Card per pseudo-state. A component with no union props _and_ default pseudo-state only is one Card. The mode should still be useful — how does the empty-variant case render?
- **Multiple union props.** A component with `variant` × `size` × `tone` has 3 axes, not 2. V1 grid is 2D — picks the two axes with the most distinct values? Or the user picks which two? Probably the latter.
- **Nested-prop-editing direction.** If the Props panel becomes selectable per-instance — clicking a project component inside a Screen reveals its props in the `Props` tab — Components mode and Screens mode share that panel architecture, and the `Props` tab becomes visible in Screens. Decide before either mode ships in detail. Also drives ADR-0009's deferred selection-source convention.

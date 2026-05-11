# ADR-0009: Right-sidebar tabbed-panel chassis

**Status:** Accepted
**Date:** 2026-05-06

## Context

ADR-0006 made the top bar a mode-switcher chassis: each mode owns its
own selection state, sidebar contents, and canvas semantics. The
right sidebar was left underspecified.

Two milestones now want the right sidebar simultaneously:

- **M1 Component Preview** — a Props variant picker (variant pills,
  pseudo-state checkboxes, shared values for non-union props).
- **M2 Screens** — a Tailwind-first Inspector (parsed utility classes
  grouped by category, structured controls per node).

A future Apps mode is likely to want its own surface again
(token / theme override controls).

If each mode invents its own right-sidebar contents, the panel
becomes a bag of `if (mode === ...)` branches — exactly the failure
mode ADR-0006 rejected for the canvas itself.

If M2 ships before the panel architecture is locked, M2 force-decides
a chassis question that should be M1's call.

## Decision

The right sidebar is a **tabbed panel chassis**, mirroring the mode
chassis pattern from ADR-0006. M1 ships the chassis; subsequent
milestones add tabs without re-architecting the sidebar.

V1 tab set:

- **Props** — content from M1 (variant picker, pseudo-state picker,
  non-union prop controls).
- **Style** — content from M2 (the Inspector).

Per-mode default tab and visible tab set:

- **Pages mode:** `Props` only. No `Style` tab.
- **Components mode:** `Props` only. No `Style` tab.
- **Screens mode:** `Style` is the default. Whether `Props` is also
  visible in Screens (for selecting a nested project component
  instance) is deferred until M1/M2 design picks the
  nested-prop-editing direction.
- **Apps mode (unscheduled):** owns its tab set when scheduled.

Per-tab state is preserved across mode switches: leaving Components
mode with the Props tab on `variant: primary, size: md` and returning
later restores that state.

Tabs are a closed registry maintained in code, not a plug-in surface.
M2 adds `Style` to the registry; future milestones add new tabs the
same way.

## Consequences

**Better:**

- Each mode's sidebar contents evolve independently. No conditional
  branching across modes inside a shared panel.
- M2 inherits a chassis instead of inventing one. The M2 PRD scopes
  the Inspector as "the contents of the Style tab," not "a new right
  sidebar."
- A future mode that wants both a `Props` tab and a `Style` tab gets
  the architecture for free.
- The "right-sidebar architecture" open question on both M1 and M2
  PRDs closes.

**Worse:**

- M1 ships more chassis than its core feature strictly requires
  (Props tab is the only visible tab in M1, but the chassis is built
  to host more). Same trade-off as the mode-switcher chassis.
- A two-tab panel with only one visible tab in some modes risks a
  visual "empty tab strip" look. Hide the tab strip when only one
  tab is visible.
- Cross-tab state coupling (e.g. selecting a node in Screens mode
  while the Props tab is also open for that same node) needs a
  selection-source convention. Defer until the nested-prop-editing
  direction is decided.

## Rejected alternatives

- **Single panel that swaps content per mode.** Rejected for the
  same reason single-canvas conditional behaviour was rejected in
  ADR-0006: pushes mode-conditional branching into a shared
  component.
- **One panel per mode, instantiated separately.** Rejected:
  duplicates the panel chrome (header, scroll container, empty
  states) per mode and prevents shared affordances (resize handle,
  collapse, future docked tools).
- **Slot-based plug-in panel where modes register arbitrary
  content.** Rejected as premature abstraction. Modes are a closed
  set; tabs are a closed registry. A plug-in surface adds runtime
  indirection with no current consumer.
- **Defer the panel decision until M2 design starts.** Rejected:
  M2's Inspector design depends on the panel shape. Deferring forces
  M2 to either invent the chassis (chassis decision made by the
  wrong milestone) or stall.

## Related

- ADR-0006 (mode taxonomy) — establishes the chassis pattern this
  ADR mirrors for the sidebar.
- M1 (Component Preview) PRD — ships the chassis with `Props` as the
  V1 tab.
- M2 (Screens) PRD — adds the `Style` tab; Inspector is its content.

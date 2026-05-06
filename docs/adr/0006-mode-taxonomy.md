# ADR-0006: Mode taxonomy for the Deloop Shell

**Status:** Accepted
**Date:** 2026-05-06

## Context

Foundation describes Deloop as a single spatial canvas surface, with
features (component preview, app views) bundled into the same canvas
mental model. The Foundation also asserts "components and compositions
are treated identically."

Adding Screens (M2) breaks that assertion. Screens are full-canvas,
non-draggable, code-driven sketch surfaces with a Tailwind-aware
inspector — fundamentally different selection model, sidebar contents,
and edit semantics from the spatial canvas.

The Component Preview surface (M1) is also distinct from the spatial
canvas: a per-component grid of variant/state cards, driven by the
sidebar, not free arrangement.

App Views (now unscheduled, originally part of Foundation's "Deepen the
experience" set) is also its own surface — read-only embedded iframes
of running apps.

Treating these as four conditional behaviors of one canvas creates
unscalable internal branching: every panel, sidebar list, selection
handler, and persistence path needs an `if (currentSurface === ...)`
fork.

## Decision

The Shell exposes orthogonal **modes**. Each mode owns its own:

- selection state
- sidebar list and detail panels
- canvas semantics (drag-arrange vs. variant grid vs. sketch with
  inspector vs. embedded iframe)
- per-mode persistence in `.deloop/canvas.json`

The four modes are:

- **Pages** — the current spatial canvas (M0)
- **Components** — Component Preview (M1)
- **Screens** — design-in-code sketch surface (M2)
- **Apps** — embedded running apps (unscheduled)

Modes are exposed via a top-bar segmented control. Switching modes
preserves per-mode state (which Page is open, which Component is being
previewed, which Screen is selected, etc.). M1 ships the chassis;
subsequent milestones add segments without re-architecting the Shell.

The `Component entry` (CONTEXT.md) gains a `kind` field that determines
which mode lists the entry. Shim entries appear in Pages and
Components; Screen entries appear in Screens.

## Consequences

**Better:**

- Each mode evolves independently. No conditional branching across
  modes inside shared components.
- Mode names map directly to user vocabulary ("I'm in Screens mode")
  which carries through to docs, onboarding, and bug reports.
- App Views can stay unscheduled without holding back the chassis or
  the other three modes.
- Clear extension point: adding a future mode is a new segment, not a
  rearchitecture.

**Worse:**

- Foundation's "components and compositions are treated identically"
  stops being true. Foundation requires amendment.
- Mode discoverability depends on the segmented control being legible.
  Users must learn that modes exist.
- Per-mode state shapes the persistence file (`canvas.json`) into a
  structured object keyed by mode rather than a flat list of cards.

## Rejected alternatives

- **Single canvas, conditional behavior.** Rejected: each mode's edit
  semantics differ enough that one canvas branching internally creates
  unscalable conditional UI. Every shared panel becomes a bag of
  `if`s.
- **Tabs only.** Rejected: tabs imply same-kind navigation (different
  pages of one surface). Modes are different surfaces. Calling them
  tabs muddies the mental model.
- **Routes.** Rejected: Deloop has no URL-as-state primary affordance.
  Mode is in-app state, not navigation history.
- **Sidebar-driven mode selection (no top-bar control).** Rejected:
  the sidebar contents themselves are mode-dependent, so sidebar can't
  be the place you switch modes.

## Related

- M1 (Component Preview) PRD will ship the mode-switcher chassis.
- M2 (Screens) PRD adds the third segment.
- Foundation amendment removes "components and compositions are treated
  identically" and introduces the mode taxonomy.
- CONTEXT.md gains a `kind` field on Component entry.

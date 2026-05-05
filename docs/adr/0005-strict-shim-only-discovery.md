# ADR-0005: Strict shim-only component discovery

**Status:** Accepted
**Date:** 2026-05-05

## Context

Deloop's sidebar must list the components a user wants to render on the
canvas. The earliest implementation auto-discovered every `.tsx` file under
`src/components/` and exposed each one. That is fine for trivial leaf
components (Button, Card) but breaks down quickly on a real design system:

- **Slot components** (`TooltipTrigger`, `AccordionItem`) crash or render
  nothing useful in isolation.
- **Compound components** (`Tooltip`, `Accordion`) need composed children
  to do anything meaningful.
- **Provider-dependent components** throw at runtime without an ancestor
  context (`TooltipProvider`, theme providers, router providers).
- **Components with required props** can't be mounted with `props={}`.
- **Components meaningless without state** need a default state seed.

A first iteration of this issue proposed a permissive override model:
shim files (`*.deloop.tsx`) layered on top of bare-file auto-discovery,
with precedence rules ("shim wins over bare file with the same base
name"). After grilling, that was rejected in favour of strict shim-only.

## Decision

A component is renderable on the canvas if and only if it is exported
from a `*.deloop.tsx` shim file. There is no fallback to bare component
files. The default discovery glob expands a configured directory path to
`<dir>/**/*.deloop.tsx`; explicit globs are passed through verbatim, so a
user who explicitly globs bare `.tsx` opts back in to bare-file scanning
(documented escape hatch — not the supported path).

Each named export of a shim is one Component entry. The export
identifier (verbatim casing) is the entry's `name`. Multiple named
exports become multiple entries pointing at the same shim file. Default
exports are ignored. Empty shims produce zero entries with no error.
Re-exports (`export { X } from "./y"`, `export { X as Y } from "./y"`)
count; `export *` does not (would require resolving the target file —
deliberate non-goal, named re-exports cover the use case).

The iframe resolves a mount as `mod[componentName]` strictly — no
default-export fallback. A missing export throws a clear error.

## Consequences

**Better:**

- One discovery rule. Easier to teach than "shim overrides bare with these
  precedence edge cases."
- Forces authors to confront defaults, props, context, and composition up
  front. The shim file is the place those decisions live, in real code,
  next to the component.
- Slot / Compound / Provider components have a natural home: a shim that
  composes the working configuration is what the sidebar surfaces.
- Trivial leaves cost ~3 lines of shim — cheap once.
- Permissive → strict is a hard migration; strict → permissive is easy if
  the constraint ever proves wrong.
- The iframe resolver is simpler — one path, one error message.

**Worse:**

- A user can no longer "just add a `.tsx` file and see it appear." Every
  renderable component requires an authored shim.
- Maintaining shims alongside components adds a small but real overhead
  to the design-system author's workflow.

## Rejected alternatives

- **Permissive override (shim-on-top-of-bare).** Rejected: edge cases
  dominate the trivial-leaf case in any non-toy component library, and
  precedence rules are harder to teach than a single rule. See Context.
- **`"use deloop hidden"` directive.** Rejected: solves only the "hide
  bare files I don't want shown" half of the problem; doesn't address
  required props, providers, or composition. Adds a magic comment
  convention with no upside over a shim file.
- **Config manifest.** Rejected: forces every component to be named in a
  separate file; loses co-location; doesn't compose with the shim's
  ability to encode default state in real React code.
- **Storybook integration.** Rejected: heavy-weight, hard to install
  inside the user's project, opinionated about formats Deloop doesn't
  share. The shim file is a much smaller surface that yields the same
  benefits for our use case.
- **Default + named-variants-with-`(variant)`-suffix model.** Original
  iteration of this proposal: `default` would render as `Component`,
  named exports as `Component (variant)` items. Rejected because per-
  state sidebar entries duplicate the right-sidebar prop editor's
  runtime job: drag once, edit props live. The variant story is encoded
  in props, not in extra entries.

## Related

- Implements AWK-73.
- Updates `CONTEXT.md` "Shim file" entry; removes the "Variant" entry.
- The bundled `@deloop/ui` ships `button.deloop.tsx` and
  `tooltip.deloop.tsx` as canonical examples of (a) trivial leaf and
  (b) provider-wrapping compound shim, respectively.

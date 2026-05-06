# ADR-0008: Scoped write-back to Screen files

**Status:** Accepted
**Date:** 2026-05-06

## Context

A Foundation invariant states: code is the source of truth, edits
happen in the editor, Deloop is a pure renderer. This stance is what
distinguishes Deloop from Figma-style tools that own the source of
truth and emit code as output.

M2 (Screens) introduces a Tailwind-aware inspector where the user
fiddles with utility classes per-node on a rendered Screen. The
fiddle loop only feels right if changes round-trip — visual edits land
in the source file and HMR reflects them on the next tick.

These two stances appear to conflict. If Deloop writes back to source,
the "pure renderer" invariant is broken. If it doesn't, the fiddle
loop is replaced with a manual copy-paste cycle that defeats the
point of Screens.

A scoped exception resolves the conflict.

## Decision

Deloop may write back to source for `*.screen.deloop.tsx` files only.
All other files — component sources, shims, configuration, app code —
remain editor-only. Deloop reads them; never writes them.

Write-back is **character-precise**: the inspector locates the
selected node's `className=""` attribute by source position (via the
React fiber's debug source info) and rewrites only that string
literal. No formatting of surrounding code, no AST round-tripping
that risks reformatting whitespace, quote style, or trailing commas.

Write-back rejects gracefully on:

- **Dynamic `className`** — function calls (`cn(...)`), template
  literals, computed expressions. The inspector surfaces "dynamic,
  not editable here."
- **Cross-file selection** — a node whose `className` lives in a file
  _other than_ the open Screen (e.g. a design-system component
  rendered inside the Screen). The inspector edits only the Screen
  file's own JSX; never traverses out.

The Screen file is the only writable surface. Component shims, design
tokens, configuration, and the user's app code are read-only from
Deloop's perspective.

## Consequences

**Better:**

- "Code is the source of truth" stance survives intact for the parts
  of the system where it matters most: components, design system, app
  code. Users editing in their editor are never racing against Deloop
  for control of those files.
- Screens get the visual fiddle loop without the existing principle
  eroding silently.
- The scope is explicit and learnable: "Deloop edits only Screen
  files." A user can reason about it without reading the source.
- Character-precise edits produce minimal diffs — friendly to git
  blame, editor formatters, and human review.

**Worse:**

- Authors can't use the Screens inspector to fiddle classes on a
  Screen-rendered design-system component's _internal_ DOM. To tweak
  a Button's internals, they must edit `button.tsx` in their editor.
  This is the right outcome (design-system components are not sketch
  surfaces) but surprises on first encounter.
- Character-precise write-back excludes some edits that would require
  AST manipulation — adding `className` to an element that has none
  (no existing attribute to rewrite). V1 only edits existing
  `className` attributes; adding new attributes is a future
  ergonomic.
- A concurrent edit to the Screen file in the editor while the user
  fiddles in the inspector creates a write conflict. The renderer
  must detect this (file mtime / version) and surface "the editor has
  changed this file, refresh to continue."

## Rejected alternatives

- **Write-back to any source file.** Rejected: erodes the foundation
  invariant. Deloop becomes a code editor by stealth and conflicts
  with users' expectation that the editor is the single point of
  truth for component code.
- **Session-local override map (no write-back).** Rejected: kills the
  round-trip feel; user must manually copy changes to source, which
  is the cycle Screens exists to remove. Also creates "did I save
  that?" anxiety on every fiddle.
- **AST-based write-back (jscodeshift / babel).** Rejected for V1:
  AST round-trips reformat surrounding code (whitespace, quote style,
  trailing commas, import ordering) which makes diffs noisy and
  conflicts with the user's editor formatter on save. Character-
  precise edits avoid this entirely. AST may become viable later for
  add-attribute use cases, but only with explicit formatter
  coordination.
- **Write-back to a sidecar JSON file (overrides applied at render
  time).** Rejected: splits the source of truth (the Screen .tsx and
  its sidecar both define styling); confuses git diffs; conflicts
  with HMR's natural granularity.

## Related

- Backs M2 (Screens). The inspector relies on this exception.
- Amends the foundation invariant "code is the source of truth, edits
  happen in the editor" with a scoped exception for
  `*.screen.deloop.tsx`.
- ADR-0007 (kind-infix file convention) defines the file convention
  this ADR scopes write access to.

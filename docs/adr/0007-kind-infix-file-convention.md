# ADR-0007: Kind-infix file convention for Deloop-aware files

**Status:** Accepted
**Date:** 2026-05-06

## Context

ADR-0005 established `*.deloop.tsx` as the canonical Shim file
convention: every Component entry on the canvas is sourced from a shim
file. Adding Screens (M2) introduces a second kind of design-time file
that needs its own discovery channel — Screens are not Shims, are not
draggable, and are listed in a different sidebar.

Future kinds may follow (fixtures, frames, scenes, decorators). The
naming convention needs to scale without forcing a custom file
extension or a separate discovery pipeline per kind.

Options weighed during the M2 PRD discussion:

1. Custom file extension per kind (`.dtsx`, `.screen.dtsx`)
2. Dedicated folder per kind (`./.deloop/screens/`)
3. Default-export manifest object declaring kind
4. Out-of-band marker (magic comment, frontmatter)
5. Kind infix in the filename, layered on `.deloop.tsx`

## Decision

A kind infix slots between the slug and the `.deloop.tsx` namespace
marker. The general pattern is:

```
<slug>.<kind>.deloop.tsx
```

Shims are the implicit default kind and use the bare form
`<slug>.deloop.tsx` (no infix). Other kinds explicitly declare:

- `button.deloop.tsx` — Shim (default kind, unchanged from ADR-0005)
- `signup.screen.deloop.tsx` — Screen (M2)
- `*.fixture.deloop.tsx` — hypothetical: test data fixtures
- `*.frame.deloop.tsx` — hypothetical: first-class frames

Discovery: the existing `*.deloop.tsx` glob continues to match all
kinds. The kind is parsed from the filename infix at indexing time.
Kind-specific discovery filters select the relevant subset:

- Shim discovery — files matching `*.deloop.tsx` with no kind infix.
- Screen discovery — files matching `*.screen.deloop.tsx`.

Kinds are a closed enum maintained in code. Unrecognised infixes
(`*.foo.deloop.tsx` where `foo` is not a known kind) are surfaced as
a discovery warning rather than silently ignored or auto-promoted to a
new kind.

## Consequences

**Better:**

- Stays inside the standard TypeScript / Vite / editor toolchain. No
  custom extensions to teach to language servers, ESLint, Prettier,
  or syntax highlighters. Every adopter's existing setup works.
- One discovery namespace (`.deloop.tsx`), one glob, kinds layered on
  top. ADR-0005's discovery rule extends rather than fragments.
- Scales for future kinds with a single-line addition to the kind
  enum and a discovery filter.
- Authors who prefer a folder convention (e.g. `src/screens/`) can
  organise that way without the file convention forcing it.

**Worse:**

- Filenames are longer. `signup.screen.deloop.tsx` is verbose compared
  to `signup.screen.tsx` or `screens/signup.tsx`. Verbosity is the
  cost of explicit namespace + kind.
- A typo in the kind infix (`*.screens.deloop.tsx` plural) lands the
  file in the unrecognised-kind warning bucket. Users have to read the
  warning to understand why their file didn't appear.
- Per-kind glob filters add a small amount of complexity to the
  discovery layer compared to one filter that matches everything.

## Rejected alternatives

- **Custom extension `.dtsx`.** Rejected: TypeScript doesn't recognise
  it natively. Every adopter pays a tooling tax — `tsconfig` includes,
  ESLint globs, Prettier configuration, Vite extension mapping, editor
  syntax-highlighting plugins. The benefit is purely aesthetic; the
  `.deloop.` infix already carries the namespace at the filename
  level.
- **Dedicated folder `./.deloop/screens/`.** Rejected: clashes with
  the existing `.deloop/` config directory (state, generated assets);
  kills colocation (a screen exploring how Tooltip composes can't sit
  next to `tooltip.deloop.tsx`); introduces a second discovery model
  (folder for screens, suffix for shims) that's harder to teach than
  one.
- **Default-export manifest object.** Rejected: adds boilerplate even
  when the manifest says nothing surprising; rots when the file
  changes; turns `kind` from a structural file property into runtime
  metadata that the discovery layer must execute the file to read.
- **Out-of-band marker (magic comment, frontmatter).** Rejected: not
  visible in the file tree; no IDE affordance; introduces a parsing
  step that's brittle compared to filename matching.

## Related

- Extends ADR-0005 (strict shim-only discovery) to support multiple
  kinds.
- M2 (Screens) is the first non-default kind to ship.
- CONTEXT.md gains a `kind` field on Component entry.

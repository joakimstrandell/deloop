# M2 — Screens

Status: Draft
Created: 2026-05-06
Updated: 2026-05-06
Linear: M2 Screens (to be created)
Depends on: M1 Component Preview (mode-switcher chassis)

## Problem

Today Deloop renders pre-built components on a spatial canvas. The author can arrange them, see them side-by-side, hot-reload them while editing in their own editor. What's missing is a place to _design in code_ — to sketch a layout by composing existing design-system components with new local components, then fiddle with spacing, colour, and typography in a Figma-shaped feedback loop.

Adjacent tools fail this in characteristic ways:

- **Storybook** has no "sketch a screen" surface — components only, in isolation.
- **Figma** gives the fiddling loop, but its output must be re-implemented in code.
- **Onlook** maps visual edits back to source, but operates over a _running app_ rather than a sketch surface.
- **Paper** is a design tool whose output is HTML/CSS, but code is exported, not the source of truth.

The gap: a code-first sketch surface where the author writes a screen as a plain React file, Deloop renders it full-canvas with hover outlines and node selection, a Tailwind-aware inspector edits utility classes per-node, and edits round-trip — visual changes show up in code, code changes show up visually via HMR.

## Goals

- Give the user a dedicated mode for design-in-code work, distinct from the spatial canvas (Pages) and Component Preview.
- Let the user compose existing components with one-off local components in the same file without ceremony.
- Provide a Tailwind-first inspector with hover outlines, node selection, and per-node controls for the most common utility groups.
- Round-trip class edits to the source file in a character-precise way that does not reformat surrounding code.
- Stay within the existing TS / Vite / editor toolchain — no custom file extensions, no per-project config tax.

## Non-goals

- Not Tailwind-only as a product call. The Screens inspector is Tailwind-first; non-Tailwind elements render fine and remain class-editable as raw text. The bigger "is Deloop Tailwind-only" question stays open.
- Not a substitute for the Pages spatial canvas — Screens are full-canvas single-document surfaces, not free arrangement.
- Not editing components or shims through the inspector. Write-back is scoped to Screen files only; component shims and underlying components remain editor-only.
- Not a Figma export / handoff path.
- Not a runtime app overlay (Onlook's territory). Screens are sketch surfaces, not production runtime hooks.

## Scope

### File convention

Screens are discovered as `*.screen.deloop.tsx` files anywhere under the user project. The `.screen.` infix layers a kind onto the existing `.deloop.tsx` shim convention from AWK-73:

```
src/screens/
  signup.screen.deloop.tsx     ← Screen
  pricing.screen.deloop.tsx    ← Screen
src/components/
  button.deloop.tsx            ← Shim (unchanged)
```

The default export of a Screen file is rendered. The file may import design-system components, define inline ad-hoc components, and contain plain JSX with utility classes. The same discovery and HMR pipeline used for Shims applies; the kind marker tells the Shell which list and which mode the entry belongs to.

### Mode switcher

M1 (Component Preview) introduces the mode chassis as a top-bar segmented control:

- **Pages** — the spatial canvas (M0)
- **Components** — Component Preview (M1)
- **Screens** — this PRD (M2)

Each mode owns its own selection state, sidebar contents, and canvas semantics. M2 adds the third segment to a chassis it does not have to invent.

### Inspector

The Inspector is the content of the **Style tab** in the right-sidebar tabbed-panel chassis (ADR-0009). M2 adds the `Style` tab to the chassis M1 ships; it does not invent a new sidebar.

The Inspector is **Tailwind-first**, not Tailwind-only. It parses Tailwind utility classes for structured controls; non-Tailwind elements (CSS Modules, vanilla classes, inline styles, CSS-in-JS) render correctly and remain class-editable as raw text — they just don't get structured controls. The bigger product question ("is Deloop Tailwind-only?") is explicitly deferred and decided separately.

When a Screen is open and a node is selected:

- **Hover outline** — hovering a node draws a 1px outline; the cursor changes to indicate selectability.
- **Click selection** — clicking a node selects it; selection persists across HMR.
- **Style tab content** — shows the selected node's tag/component identity and its Tailwind classes, parsed and grouped by category:
  - spacing (`p-*`, `m-*`, `gap-*`)
  - colour (`bg-*`, `text-*`, `border-*`)
  - typography (`text-*` size, `font-*`, `leading-*`, `tracking-*`)
  - layout (`flex`, `grid`, `flex-*`, `grid-*`, `items-*`, `justify-*`)
  - effects (`rounded-*`, `shadow-*`, `opacity-*`)
- **Structured controls** for utility classes the inspector recognises — number stepper for `p-N` / `m-N` / `gap-N`, swatch for `bg-*` / `text-*` / `border-*`, etc. Existing classes show their parsed values; V1 edits in place rather than offering a "browse all utilities" picker.
- **Project-aware values** — the inspector reads the project's Tailwind config (v3 `tailwind.config.*` or v4 CSS-defined config) so colour swatches and spacing scales reflect the project's tokens, not generic Tailwind defaults.
- **Computed-style readback** for properties not expressed as utilities — informational, read-only.
- **Dynamic class fallback** — for `className={cn(...)}` or template literals, the inspector surfaces "dynamic, not editable here" rather than guessing.
- **Arbitrary values and variants** — `p-[17px]`, `hover:p-4`, `md:p-8` are surfaced as raw class atoms in V1, readable but not editable through structured controls.

### Write-back

Screens are the only files Deloop edits. Write-back is character-precise: the inspector finds the selected node's `className=""` attribute by source location and rewrites it. No reformatting of surrounding code. Edits flow through HMR back to the canvas on the same tick.

The write-back rejects gracefully on:

- Dynamic `className` (function calls, template literals)
- Selected nodes that live in a referenced component file (the inspector only edits within the Screen file)

## Success criteria

- A `*.screen.deloop.tsx` file appears in the Screens list within 1s of being created.
- Switching to Screens mode shows the selected Screen rendered full-canvas.
- Hovering any rendered node shows an outline; clicking selects it.
- The inspector lists the selected node's Tailwind classes, grouped by category.
- Editing a spacing utility (`p-2` → `p-4`) writes back to the source file; the canvas reflects the change.
- Editing a colour utility writes back the new class atom.
- A node with `className={cn(...)}` shows in the inspector as "dynamic, not editable here" without erroring.
- A code edit in the editor (e.g. removing a class) flows through HMR and the inspector updates.

## Open questions

- **Scope of structured controls.** Spacing / colour / typography / layout in V1 is the floor. Where to draw the line on `flex-*`, `grid-*`, `gap-*` (probably in), `animate-*` and `motion-*` (probably out)?
- **Tailwind config awareness.** Inspector colour swatches should reflect the project's actual palette, not generic Tailwind defaults. Means reading `tailwind.config.*` (v3) or the CSS-defined config (v4). Robustness across Tailwind versions needs design.
- **Selecting nested project components.** If a Screen renders `<Button variant="primary" />` and the user clicks the Button, do they edit (a) the Button instance's props, or (b) the Tailwind classes on the rendered Button DOM? Likely (a) on click of the component box, (b) on click of inner DOM. Needs UX design.
- **Relationship to AWK-16.** The right-sidebar tabbed-panel chassis is locked (ADR-0009) — M1 ships the chassis with `Props`, M2 adds `Style`. What remains open: when a Screen renders a project component instance and the user selects it, does the `Props` tab become visible in Screens mode for that selection? AWK-16's nested-prop-editing direction decides this.
- **Layout primitives.** Frames and auto-layout in Screens (mirroring Figma) — out of V1 by default; composition lives in code. Revisit if real users hit the wall.
- **Adding new utilities.** V1 only edits existing classes. Adding a class atom that wasn't there before (e.g. user wants to add `rounded-lg` to a node that has none) is a V2 ergonomic win.

## Decisions

- **2026-05-06** — File convention is `*.screen.deloop.tsx` (see ADR-0007). Stays consistent with the `.deloop.tsx` shim convention from ADR-0005, keeps the TS / Vite / editor stack untouched, scales for future kinds. Custom extensions like `.dtsx` rejected on tooling cost.
- **2026-05-06** — Write-back is permitted only for Screen files (see ADR-0008). Components and shims remain editor-only. Preserves the "code is the source of truth" stance from foundation while giving Screens a tight visual loop. Character-precise edits avoid AST round-tripping that would reformat surrounding code.
- **2026-05-06** — Inspector is **Tailwind-first**, not Tailwind-only. Non-Tailwind elements render fine and remain class-editable as raw text; they just don't get structured controls. The bigger "Deloop Tailwind-only?" question is explicitly deferred — to be decided with M3 (tokens) inputs and adopter feedback. Rejected alternatives: Tailwind-only product call (premature), CSS-only inspector (fights the utility idiom), pluggable adapters from V1 (premature abstraction), computed-style → utility round-tripping (deceptively hard mapping). Rationale: most modern design-system projects use Tailwind; structured controls there carry weight; non-Tailwind users still get rendering, hover, selection, and raw class editing.
- **2026-05-06** — Mode taxonomy lands in M1 (see ADR-0006). M2 adds the Screens segment to a chassis it does not have to invent. App Views deferred out of the active milestone sequence to unscheduled.
- **2026-05-06** — Right-sidebar tabbed-panel chassis lands in M1; M2 adds the `Style` tab (see ADR-0009). The Inspector is Style-tab content, not a new sidebar. Closes the right-sidebar architecture question.
- **2026-05-06** — Component entry gains a `kind` field (Shim / Screen / future). Discovery filters by kind to populate per-mode sidebars.

## Foundation deltas

The following foundation amendments are required (separate pass, after this PRD lands):

- Replace "components and compositions are treated identically" with the mode taxonomy (Pages / Components / Screens, App Views unscheduled).
- Demote App Views to unscheduled.
- Slim `foundation.md` to vision only; extract per-milestone content into `mN-*.md` PRDs.
- Update `README.md` naming convention to allow the `mN-` prefix for milestone-aligned PRDs.

## Linked ADRs / Plans

- [ADR-0005](../adr/0005-strict-shim-only-discovery.md) — base shim discovery model.
- [ADR-0006](../adr/0006-mode-taxonomy.md) — Pages / Components / Screens / Apps modes; chassis lands in M1.
- [ADR-0007](../adr/0007-kind-infix-file-convention.md) — `*.screen.deloop.tsx` file convention.
- [ADR-0008](../adr/0008-scoped-write-back-to-screen-files.md) — write-back scoped to Screen files.
- [ADR-0009](../adr/0009-right-sidebar-tabbed-panel-chassis.md) — right-sidebar tabbed-panel chassis the Inspector lives in.
- [AWK-16](https://linear.app/awkwardgroup/issue/AWK-16/typescript-prop-inference-and-props-panel) — overlaps via the nested-prop-editing follow-up; share the right-sidebar panel architecture.
- `docs/prd/foundation.md` — vision; will be amended per the deltas above.

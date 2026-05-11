# M2 — Screens

Status: Draft

## Problem Statement

Today Deloop renders pre-built components on a spatial canvas. The author can arrange them, see them side-by-side, hot-reload them while editing in their own editor. What's missing is a place to _design in code_ — to sketch a layout by composing existing design-system components with new local components, then fiddle with spacing, colour, and typography in a Figma-shaped feedback loop.

Adjacent tools fail this in characteristic ways:

- **Storybook** has no "sketch a screen" surface — components only, in isolation.
- **Figma** gives the fiddling loop, but its output must be re-implemented in code.
- **Onlook** maps visual edits back to source, but operates over a _running app_ rather than a sketch surface.
- **Paper** is a design tool whose output is HTML/CSS, but code is exported, not the source of truth.

The gap: a code-first sketch surface where the author writes a screen as a plain React file, Deloop renders it full-canvas with hover outlines and node selection, a Tailwind-aware inspector edits utility classes per-node, and edits round-trip — visual changes show up in code, code changes show up visually via HMR.

## Solution

Screens mode is the third segment in the M1 chassis. Files named `*.screen.deloop.tsx` are discovered as Component entries of kind Screen (ADR-0007); selecting one renders its default export full-canvas. Hovering a node draws a 1px outline; clicking selects it (selection persists across HMR). The right sidebar's Style tab (ADR-0009) becomes the Inspector — Tailwind-first parsing of utility classes into structured controls for spacing, colour, typography, layout, and effects, reading the project's actual Tailwind config so swatches and scales match the project's tokens. Editing a utility writes back character-precisely to the Screen file's `className` (ADR-0008); the edit flows through HMR on the same tick without reformatting surrounding code. Non-Tailwind elements render fine and remain class-editable as raw text. Dynamic `className` expressions and selections that resolve inside a referenced component file are surfaced as "dynamic, not editable here" without erroring.

A `*.screen.deloop.tsx` file appears in the Screens list within 1s of being created. Switching to Screens mode shows the selected Screen rendered full-canvas. Editing `p-2` → `p-4` in the Inspector writes back to the source file and the canvas reflects the change; editing a colour utility writes back the new class atom. Code edits in the editor (e.g. removing a class) flow through HMR and the Inspector updates.

## User Stories

- As a developer, I want `*.screen.deloop.tsx` files discovered and surfaced in a Screens-mode sidebar within 1s of creation, so that authoring a Screen feels like authoring any other file.
- As a developer, I want to compose design-system components, inline ad-hoc components, and plain JSX with utility classes in the same Screen file without ceremony, so that sketching a layout doesn't fight the toolchain.
- As a developer, I want to switch to Screens mode and see the selected Screen rendered full-canvas, so that I work in a sketch surface rather than a Card arrangement.
- As a developer, I want a hover outline (cursor change to indicate selectability) and click selection on rendered nodes, so that I can target any element to inspect or edit.
- As a developer, I want my selection to persist across HMR, so that I do not have to re-select after every code edit.
- As a developer, I want the Inspector to list the selected node's tag/component identity and its Tailwind classes grouped by category (spacing, colour, typography, layout, effects), so that I see and adjust style at the level I usually think in.
- As a developer, I want structured controls (number stepper for `p-N` / `m-N` / `gap-N`, swatch for `bg-*` / `text-*` / `border-*`, etc.) that read my project's Tailwind config, so that swatches and scales reflect my tokens, not generic defaults.
- As a developer, I want editing a utility through the Inspector to write back to the Screen file character-precisely and re-render via HMR, so that the visual loop and the code stay in sync without reformatting surrounding code.
- As a developer, I want computed-style readback as informational fallback for properties not expressed as utilities, so that I can still inspect what's rendered.
- As a developer, I want nodes with dynamic `className` (`cn(...)`, template literals) to surface as "dynamic, not editable here" rather than guessing, so that I trust the Inspector not to corrupt my code.
- As a developer, I want arbitrary values and variants (`p-[17px]`, `hover:p-4`, `md:p-8`) shown as raw class atoms in V1, so that they remain visible even though structured controls don't cover them yet.

## Implementation Decisions

- **Kind-infix file convention** — see ADR-0007. Screens are `*.screen.deloop.tsx`; the `.screen.` infix layers a kind onto the existing `.deloop.tsx` shim convention (ADR-0005). Stays inside the TS / Vite / editor toolchain, scales to future kinds. Custom extensions like `.dtsx` rejected on tooling cost.
- **Scoped write-back to Screen files** — see ADR-0008. Screens are the only files Deloop edits. Write-back is character-precise: the Inspector finds the selected node's `className=""` attribute by source location and rewrites it; surrounding code is not reformatted. Components and shims remain editor-only. Write-back rejects gracefully on dynamic `className` (function calls, template literals) and on selections that live in a referenced component file.
- **Mode taxonomy and chassis** — see ADR-0006. M2 adds the Screens segment to the chassis M1 ships; mode taxonomy lands in M1.
- **Right-sidebar tabbed-panel chassis** — see ADR-0009. M2 adds the `Style` tab; the Inspector is Style-tab content, not a new sidebar.
- **Inspector is Tailwind-first, not Tailwind-only.** Non-Tailwind elements (CSS Modules, vanilla classes, inline styles, CSS-in-JS) render correctly and remain class-editable as raw text — they just don't get structured controls. The bigger "Deloop Tailwind-only?" question is explicitly deferred, to be decided with M3 (tokens) inputs and adopter feedback. Rejected alternatives: Tailwind-only product call (premature), CSS-only inspector (fights the utility idiom), pluggable adapters from V1 (premature abstraction), computed-style → utility round-tripping (deceptively hard mapping). Rationale: most modern design-system projects use Tailwind; structured controls there carry weight; non-Tailwind users still get rendering, hover, selection, and raw class editing.
- **Project-aware values.** The Inspector reads the project's Tailwind config (v3 `tailwind.config.*` or v4 CSS-defined config) so colour swatches and spacing scales reflect the project's tokens, not generic Tailwind defaults.
- **V1 edits in place; no "browse all utilities" picker.** Existing classes are parsed and edited; adding utilities that weren't there before is a V2 ergonomic win.
- **Component entry gains a `kind` field** (Shim / Screen / future). Discovery filters by kind to populate per-mode sidebars. The same discovery and HMR pipeline used for Shims applies; the kind marker tells the Shell which list and which mode the entry belongs to.

Shared with M1 via [AWK-16](https://linear.app/awkwardgroup/issue/AWK-16/typescript-prop-inference-and-props-panel): the right-sidebar tabbed-panel chassis is locked (ADR-0009); whether the `Props` tab becomes visible in Screens mode for a selected project-component instance depends on AWK-16's nested-prop-editing direction.

## Testing Decisions

- **Unit** — Tailwind utility parsing into structured groups; Screen-file source-location detection for write-back; dynamic-className detection.
- **Integration** — Inspector → write-back → HMR → re-render round-trip; selection persistence across HMR; Tailwind config readback (v3 and v4).
- **E2E** — Screen discovery and switch, hover outline + click selection, spacing/colour edit round-trip, `cn(...)` "not editable here" surface, code-edit-from-editor reflected in Inspector.

See [docs/agent/testing.md](../agent/testing.md).

## Out of Scope

- Editing components or shims through the Inspector. Write-back is scoped to Screen files only; component shims and underlying components remain editor-only.
- Tailwind-only product call. The Inspector is Tailwind-first; the bigger product question stays open.
- Substitute for the Pages spatial canvas — Screens are full-canvas single-document surfaces, not free arrangement.
- Figma export / handoff path.
- Runtime app overlay (Onlook's territory). Screens are sketch surfaces, not production runtime hooks.
- Adding new utility classes that weren't already in the source — V1 edits existing classes only.
- Layout primitives (Frames, auto-layout) in Screens — composition lives in code in V1.
- Structured controls for `animate-*` and `motion-*` — likely out of V1.

## Further Notes

- **Scope of structured controls.** Spacing / colour / typography / layout in V1 is the floor. Where to draw the line on `flex-*`, `grid-*`, `gap-*` (probably in), `animate-*` and `motion-*` (probably out)?
- **Tailwind config awareness.** Inspector colour swatches should reflect the project's actual palette, not generic Tailwind defaults. Means reading `tailwind.config.*` (v3) or the CSS-defined config (v4). Robustness across Tailwind versions needs design.
- **Selecting nested project components.** If a Screen renders `<Button variant="primary" />` and the user clicks the Button, do they edit (a) the Button instance's props, or (b) the Tailwind classes on the rendered Button DOM? Likely (a) on click of the component box, (b) on click of inner DOM. Needs UX design.
- **Relationship to AWK-16.** The right-sidebar tabbed-panel chassis is locked (ADR-0009) — M1 ships the chassis with `Props`, M2 adds `Style`. What remains open: when a Screen renders a project component instance and the user selects it, does the `Props` tab become visible in Screens mode for that selection? AWK-16's nested-prop-editing direction decides this.
- **Layout primitives in Screens.** Frames and auto-layout (mirroring Figma) — out of V1 by default; composition lives in code. Revisit if real users hit the wall.
- **Adding new utilities.** V1 only edits existing classes. Adding a class atom that wasn't there before (e.g. user wants to add `rounded-lg` to a node that has none) is a V2 ergonomic win.
- **Foundation deltas (stale).** Original PRD flagged a follow-up to: replace "components and compositions are treated identically" with the mode taxonomy, demote App Views to unscheduled, slim `foundation.md` to vision only, and update `README.md` naming to allow the `mN-` prefix. Foundation and README have since been updated; leaving the note for trace.

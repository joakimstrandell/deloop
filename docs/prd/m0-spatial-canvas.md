# M0 — Spatial Canvas

Status: Active

## Problem Statement

Designing UI components in code today lacks the spatial, iterative quality of a design tool. Developers work in an editor, mentally simulate what the code produces, wait for a dev-server refresh, and switch tabs to evaluate the result. There is no overview, no side-by-side comparison of states, and no spatial layout that lets the system be evaluated as a whole.

M0 is the load-bearing milestone for Deloop's identity: real React components from the user's project, rendered live on an infinite, zoomable, pannable canvas, with TypeScript-driven prop controls and pseudo-state forcing. Without this milestone there is no Deloop.

## Solution

Deloop is installed as a dev dependency and started via the `deloop` CLI (or `pnpm --filter @deloop/cli dev --root <path>`). It discovers components from `*.deloop.tsx` shim files (ADR-0005), serves them via Vite, and renders them as live React Cards on an infinite, zoomable, pannable canvas inside a full-document iframe (ADR-0001). Cards render in the project's real style environment — Tailwind output, custom properties, fonts, resets — exactly as in production. Each Card has its own inferred prop controls and can be forced into a specific pseudo-state for static side-by-side comparison. Canvas state — positions, zoom, props, pseudo-states, Page structure — persists between sessions; component edits flow through HMR without disturbing Card placement or prop configuration.

A running `deloop` against a project with shims renders the discovered components in the sidebar within 1s of startup. Dragging a Component entry onto the canvas creates a Card; editing a component file flows through HMR and the Card re-renders without losing position or prop state. Zooming via scroll wheel scales smoothly; panning works on empty space. The right sidebar renders one inferred control per prop for the selected Card. A Card set to `hover` displays hover styles statically. Switching between Pages preserves per-page Card layouts. Closing and reopening Deloop restores all Cards in their previous positions, props, and pseudo-states.

## User Stories

- As a developer, I want to run `deloop` from my project root, so that I can launch the workbench against my own components without separate setup.
- As a developer, I want my `*.deloop.tsx` shims to appear in a Components palette in the left sidebar, so that I can see discoverable entries without configuring anything.
- As a developer, I want shim appearances and removals to flow through to the palette live, so that I never need to refresh after editing files on disk.
- As a developer, I want to drag a Component entry from the palette onto the canvas, so that a live-rendered Card appears at the drop position.
- As a developer, I want multiple Cards of the same component with independent props and pseudo-states, so that I can compare configurations spatially.
- As a developer, I want the canvas infinite, zoomable, and pannable (pinch / scroll wheel zoom, drag on empty space to pan), so that I can compose layouts at any scale.
- As a developer, I want Cards to render in my project's real style environment, so that components look the way they will in production.
- As a developer, I want a controls panel that surfaces one input per inferred prop (text, select, toggle, number; raw JSON fallback for complex types), so that I can adjust a Card's configuration without writing code.
- As a developer, I want pseudo-state controls (hover, focus, focus-visible, active, disabled) per Card, so that I can view interactive states statically and side-by-side.
- As a developer, I want named Pages I can create, rename, and switch between from the left sidebar above the Components palette, so that I can keep separate canvas layouts organized.
- As a developer, I want component edits to flow through HMR without disturbing Card position or prop state, so that I can iterate code without losing my arrangement.
- As a developer, I want canvas state persisted to `.deloop/canvas.json` and restored on next launch, so that I pick up where I left off.
- As a developer, I want a Shell-side dark-mode toggle that flips theme tokens in the canvas (with a `system` mode that follows `prefers-color-scheme` live), so that I can preview components under either theme without changing my OS setting.

## Implementation Decisions

- **Iframe canvas isolation** — see ADR-0001.
- **Vite programmatic API** — see ADR-0002.
- **pnpm workspaces monorepo** — see ADR-0003.
- **SSE for server → shell push** — see ADR-0004.
- **Strict shim-only discovery** — see ADR-0005. The default discovery glob expands a configured directory path to `<dir>/**/*.deloop.tsx`. Each named export is one Component entry; the export identifier (verbatim) is the entry's name. Default exports are ignored. Discovery emits add / unlink events to the Shell over SSE.
- **TypeScript prop inference.** Props are inferred statically from the component's TypeScript types at startup via `react-docgen-typescript` or equivalent; re-analysed on file change. The current implementation analyses the shim's exported wrapper; the correct target is the shim's interior — the components the shim renders. Tracked on [AWK-16](https://linear.app/awkwardgroup/issue/AWK-16/typescript-prop-inference-and-props-panel).
- **Pseudo-state forcing via CSS injection.** Each Card can be set to a specific interactive state so every state can be viewed statically and side-by-side.
- **Canvas iframe loads project styles.** Tailwind output, CSS custom properties, font imports, resets — exactly as they would be loaded in the real app. Components render in a faithful reproduction of their production environment.
- **Canvas chrome in a shadow root.** Deloop's chrome (card frames, labels, error UI) lives in a shadow root inside the canvas iframe to avoid colliding with project CSS.
- **Style entry detection.** When `.deloop/config.ts` does not declare `styles`, Deloop probes a fixed list of conventional CSS paths under the project root and loads the first match. No warning when none match. The configured value is the opt-out; the path list is in the CLI source, not user-editable.
- **Providers composed per-shim.** Providers (theme, query client, i18n, compound parents) are wrapped inside the shim that needs them — the canonical pattern in `@deloop/ui`. A global wrapper / auto-detection of common providers is an M3 ergonomic, not an M0 mechanism.
- **Page tabs in the left sidebar.** The Pages list lives above the Components palette in the left sidebar. Page tabs do not occupy the top bar. Mirrors Figma's left-sidebar Pages affordance. The data model is designed to support future addition of frames (grouping regions within Pages) without rearchitecting.
- **Canvas state persistence.** Stored in `.deloop/canvas.json` (positions, zoom, per-Card prop and pseudo-state configurations, Page structure). Debounced auto-save on every change; gitignored by default.

## Testing Decisions

- **Unit** — component discovery, protocol parsing/validation, canvas-state shape transformations.
- **Integration** — shell ↔ iframe message handling, the discovery → mount flow (`/api/components` → `postMessage` → iframe render).
- **E2E** — drag-and-drop placement, HMR-preserved Card state, pseudo-state forcing, dark-mode toggle, canvas persistence across restarts.

See [docs/agent/testing.md](../agent/testing.md) for the full pyramid and required checks.

## Out of Scope

- Token / theme editing UI (M3)
- Component Preview mode (M1)
- Screens (M2) and the mode-switcher chassis (M1)
- Right-sidebar tabbed-panel chassis (M1)
- App Views (unscheduled)
- Global provider wrapper / auto-detection (M3)
- Multi-framework support (Svelte, Vue, vanilla) — React 19 only in M0
- Built-in LLM / AI features
- Built-in code editing
- Visual regression testing
- Frames within Pages
- Shared canvas layouts (collaborative)

## Further Notes

- **Frames inside Pages.** Foundation flags Frames as a Pages enhancement deferred from M0. Out of M0 by design; revisit when real layouts hit the wall.

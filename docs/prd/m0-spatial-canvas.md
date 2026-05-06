# M0 — Spatial Canvas

Status: Active (in flight)
Created: 2026-04-28
Updated: 2026-05-06
Linear: M0 Spatial Canvas

## Problem

Designing UI components in code today lacks the spatial, iterative quality of a design tool. Developers work in an editor, mentally simulate what the code produces, wait for a dev-server refresh, and switch tabs to evaluate the result. There is no overview, no side-by-side comparison of states, and no spatial layout that lets the system be evaluated as a whole.

M0 is the load-bearing milestone for Deloop's identity: real React components from the user's project, rendered live on an infinite, zoomable, pannable canvas, with TypeScript-driven prop controls and pseudo-state forcing. Without this milestone there is no Deloop.

## Goals

- Render components from the user's own project, in their real style environment, at full fidelity.
- Make the canvas the central surface — infinite, zoomable, pannable, with multiple cards arranged spatially.
- Drive component discovery from `*.deloop.tsx` shim files (ADR-0005), keeping author intent explicit and supporting Slot / Compound / Provider patterns.
- Surface inferred props in a controls panel; let the user toggle pseudo-states.
- Hot-reload component changes from disk into already-mounted cards.
- Persist canvas state (positions, zoom, props, page structure) so the user picks up where they left off.

## Non-goals

- Token or theme editing in the UI (M3).
- Component Preview mode (M1).
- Screens design-in-code mode (M2).
- App Views — embedded running apps (unscheduled).
- Multi-framework rendering — React 19 only in M0.
- Built-in code editing or AI features.

## Scope

### CLI entry point

Deloop is installed as a dev dependency. Running `deloop` (or `pnpm --filter @deloop/cli dev --root <path>`) in the user's project starts a Node.js server that serves the Shell, runs Vite for the user's components, and watches the filesystem.

### Component discovery

Strict shim-only (ADR-0005). The default discovery glob expands a configured directory path to `<dir>/**/*.deloop.tsx`. Each named export of a shim is one Component entry; the export identifier (verbatim) is the entry's name. Default exports are ignored. Discovery emits add / unlink events to the Shell over SSE (ADR-0004).

### Left sidebar

The left sidebar holds two stacked sections in M0:

- **Pages list** (top) — the user's named Pages, with the active Page highlighted; create / rename / switch from here.
- **Components palette** (below) — all discovered Component entries, draggable onto the active Page's canvas. Live updates flow over SSE — file appearances and removals reflect in the palette without a refresh.

### Canvas — infinite, zoomable, pannable

The canvas is a full-document iframe (ADR-0001), style-isolated from the Shell. Inside it, a container div holds all Cards and is transformed for zoom (CSS `scale`) and pan (CSS `translate`). Zoom via pinch or scroll wheel; pan via drag on empty canvas space.

### Drag-and-drop placement

Dragging a Component entry from the sidebar onto the canvas creates a Card at the drop position. Multiple Cards of the same component can coexist with independent prop and pseudo-state configurations. Multiple different components can coexist on the same Page.

### Canvas style environment

The canvas iframe loads the project's own styles — Tailwind output, CSS custom properties, font imports, resets — exactly as they would be loaded in the real app. Components render in a faithful reproduction of their production environment. Deloop's chrome (card frames, labels, error UI) lives in a shadow root inside the iframe to avoid colliding with project CSS.

### TypeScript prop inference

Props are inferred statically from the component's TypeScript types at startup (`react-docgen-typescript` or equivalent). The right sidebar renders controls per prop: string → text input, string union → select, boolean → toggle, number → number input. Complex / unsupported types fall back to a raw JSON editor. Re-analysed on file change.

The current implementation analyses the shim's exported wrapper. The correct target is the shim's interior — the components the shim renders. Tracked on AWK-16; reword the issue's AC before kickoff.

### Pseudo-state controls

Each Card can be set to a specific interactive state: hover, focus, focus-visible, active, disabled. States are forced via CSS injection so every state can be viewed statically and side-by-side.

### Pages

The canvas supports multiple named Pages, switchable via the Pages list in the left sidebar (above the Components palette). The data model is designed to support future addition of frames (grouping regions within Pages) without rearchitecting.

### Component hot-reload

The Vite server watches component files. On change, HMR pushes the update into the canvas iframe and affected Cards re-render with the updated code. Card positions and prop configurations are preserved across hot-reloads.

### Canvas state persistence

Component positions, zoom level, per-card prop and pseudo-state configurations, and Page structure are stored in `.deloop/canvas.json`. Auto-saved on every change (debounced). `.deloop/canvas.json` is gitignored by default.

### Dark-mode toggle

A Shell-side toggle applies `.dark` to the canvas iframe's `<html>`, flipping theme tokens. `system` mode follows `prefers-color-scheme` live.

## Success criteria

- Running `deloop` against a project with `*.deloop.tsx` shims renders the discovered components in the sidebar within 1s of startup.
- Dragging a component onto the canvas creates a Card that renders in the project's real style environment.
- Editing a component file in the editor flows through HMR; the corresponding Card re-renders without losing position or prop state.
- Zooming the canvas via scroll wheel scales smoothly; panning works on empty space.
- The right sidebar renders one inferred control per prop for the selected Card; changing a control updates the rendered component instantly.
- A Card set to `hover` displays its hover styles statically.
- Switching between Pages preserves per-page Card layouts.
- Closing and reopening Deloop restores all Cards in their previous positions, props, and pseudo-states.

## Open questions

- **Frames inside Pages.** Foundation flags Frames as a Pages enhancement deferred from M0. Out of M0 by design; revisit when real layouts hit the wall.

## Decisions

- **Shim-only discovery** — see ADR-0005.
- **Iframe canvas isolation** — see ADR-0001.
- **Vite programmatic API** — see ADR-0002.
- **SSE for server → shell push** — see ADR-0004.
- **pnpm workspaces monorepo** — see ADR-0003.
- **Style entry detection.** When `.deloop/config.ts` does not declare `styles`, Deloop probes a fixed list of conventional CSS paths under the project root and loads the first match. No warning when none match. Configured value is the opt-out; the path list is in the CLI source, not user-editable.
- **Providers composed per-shim.** Providers (theme, query client, i18n, compound parents) are wrapped inside the shim that needs them — the canonical pattern in `@deloop/ui`. A global wrapper / auto-detection of common providers is an M3 ergonomic, not an M0 mechanism.
- **Page tabs in the left sidebar.** The Pages list lives above the Components palette in the left sidebar. Page tabs do not occupy the top bar. Mirrors Figma's left-sidebar Pages affordance.

## Out of scope (M0)

- Token / theme editing UI (M3)
- Component Preview mode (M1)
- Screens (M2) and the mode-switcher chassis (M1)
- Right-sidebar tabbed panel chassis (M1)
- App Views (unscheduled)
- Global provider wrapper / auto-detection (M3)
- Multi-framework support (Svelte, Vue, vanilla)
- Built-in LLM / AI features
- Visual regression testing
- Frames within Pages
- Shared canvas layouts (collaborative)

## Linked ADRs / Plans

- [ADR-0001](../adr/0001-iframe-canvas-isolation.md)
- [ADR-0002](../adr/0002-vite-programmatic-api.md)
- [ADR-0003](../adr/0003-pnpm-workspaces-monorepo.md)
- [ADR-0004](../adr/0004-sse-for-server-to-shell-push.md)
- [ADR-0005](../adr/0005-strict-shim-only-discovery.md)
- `docs/prd/foundation.md` — vision.

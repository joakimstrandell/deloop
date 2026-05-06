# M3 — Tokens and Themes

Status: Draft
Created: 2026-05-06
Updated: 2026-05-06
Linear: M3 Tokens & Themes (to be created)
Depends on: M0 Spatial Canvas

## Problem

Foundation argues that the canvas without token editing is a spatial Storybook — useful, but missing the value that makes Deloop Deloop. The core feedback loop the product exists to deliver is:

> Arrange components spatially → tweak a design token or switch a theme → see the ripple across everything instantly.

M0 ships the spatial canvas; M1 and M2 deepen the experience around it. M3 closes the loop: tokens become a first-class design knob, themes become switchable, and a build step emits the formats consuming apps actually use.

This is also the most architecturally heavy milestone. Token formats are a multi-tool ecosystem (DTCG, Tailwind config, CSS custom properties, SCSS variables, Tokens Studio). Theme semantics interact with the canvas iframe's CSS injection model. The build step is a real piece of build tooling, not a UI surface. Land this carefully, after M0 / M1 / M2 have validated the canvas surface.

## Goals

- Own the design-token layer at `.deloop/tokens.json` in DTCG (W3C) format.
- Provide live in-UI token editing — color picker, spacing slider, typography selector — that updates the canvas via CSS variable injection with no reload.
- Support multiple themes (light, dark, brand variants) as named overrides within the same DTCG structure; switch globally or per Card.
- Build step transforming DTCG → CSS custom properties (default), with Tailwind config and SCSS as configurable additional outputs, written to `.deloop/dist/`.
- Support importing existing tokens from non-DTCG formats on first run (CSS custom properties, Tailwind config, Tokens Studio JSON).

## Non-goals

- Not a token-management product on its own — this milestone exists in service of the canvas feedback loop, not as a standalone replacement for Tokens Studio or Style Dictionary.
- Not the Tailwind-only product call. M2's inspector is Tailwind-first; M3 may produce Tailwind config as one output among several. Whether Deloop's broader product positioning is Tailwind-only is decided after M3 ships and adopter feedback lands.
- Not collaborative / multi-user token editing. Tokens live on disk; conflicts are Git's job.
- Not visual regression on token changes (a future, post-M3 capability).
- Not Figma sync or external-tool round-tripping in M3.

## Scope

### Token file

`.deloop/tokens.json` is the canonical source of truth, in DTCG v1 format. On first run with no token file, Deloop scaffolds a minimal DTCG structure. The CLI ensures the file exists and reads it on every boot.

### Live token editor

A dedicated panel (likely the right sidebar in a Tokens-mode-extension or a standing panel) renders one control per token, grouped by token type:

- color → color picker
- spacing → slider + numeric input
- typography → font selector + size / weight / leading inputs
- radius → numeric input
- shadow → composite editor

Editing a value injects an updated CSS custom property directly into the canvas iframe's `:root`. All Cards rendering tokens that depend on the changed value update simultaneously. No save, no reload — the file write and CSS injection are the same action.

### Themes

Themes are named sets of token overrides within the same DTCG structure. A `light` theme and a `dark` theme share the same token keys but provide different values. Theme switching uses the same CSS variable injection path as individual token edits — instant, no reload.

The canvas can apply a theme:

- **Globally** — all Cards render under the selected theme (top-bar control).
- **Per Card** — the same component rendered under multiple themes side-by-side (Card-level theme override, useful for Pages mode multi-theme layouts).

### Token build step

Deloop transforms DTCG JSON into one or more output formats and writes them to `.deloop/dist/`. The default is CSS custom properties, regenerated on every token change. Additional formats are opt-in via `.deloop/config.ts`:

- CSS custom properties (default) — `dist/tokens.css`
- Tailwind config — `dist/tailwind.tokens.js` (mergeable into the project's `tailwind.config.*`) or v4 CSS `@theme` block
- SCSS variables — `dist/tokens.scss`

The build is incremental and runs on token edit; consumers reference `dist/` outputs in their app build pipelines.

### Token import (one-time)

On first run with no `tokens.json` but recognisable token sources elsewhere in the project (Tailwind config, CSS custom properties at the top of a stylesheet, a Tokens Studio JSON), Deloop offers to scaffold the DTCG file from the detected source. Best-effort, one-time, the user reviews the result. Subsequent edits flow through the DTCG file.

### Provider auto-detection (related)

Common context providers (`@tanstack/react-query` → `QueryClientProvider`, `react-router` → `MemoryRouter`) are auto-detected from `package.json` and offered as canvas wrappers. The `.deloop/config.ts` wrapper component remains the escape hatch for custom cases. Bundled here because it lands the broader "make the canvas feel like the user's app" deeper.

## Success criteria

- A user with no `.deloop/tokens.json` boots Deloop and gets a working tokens scaffold.
- Editing a color value in the token panel updates every Card that uses that color, instantly, with no reload.
- Switching the global theme from `light` to `dark` flips every Card's theme tokens on the same tick.
- A Card configured with a per-Card theme override renders independently from the global theme.
- After a token edit, `.deloop/dist/tokens.css` is updated on disk.
- Configuring `outputs: ["css", "tailwind"]` produces both `tokens.css` and `tailwind.tokens.js` on every token edit.
- Importing from an existing Tailwind config produces a DTCG file the user can immediately edit.

## Open questions

- **Mode integration.** Does Tokens / Themes get its own mode in the M1 chassis, or live as a panel reachable from any mode? The canvas-wide value of token edits argues for a panel that's available alongside whatever mode is active, not a dedicated Tokens mode. Decide during M3 design.
- **Tailwind v3 vs v4.** Tailwind v4 changes the config story significantly (CSS-defined `@theme` blocks). The build step needs explicit handling for both. Likely emits v4-style CSS for v4 projects and v3-style JS for v3 projects, detected from `package.json`.
- **DTCG superset.** The W3C DTCG v1 spec is stable but lean. Some Deloop concerns (theme overrides, semantic / primitive token distinction, token aliases across themes) may need a clearly-namespaced superset. Land minimal DTCG; extend as gaps emerge.
- **Token file ownership and editor concurrency.** If the user edits `tokens.json` in their editor while Deloop has it open, the same write-back contention as Screens applies. Use the same mtime / version-detection pattern from M2.
- **Tailwind-only product call.** This milestone is the natural moment to revisit the question. By the time M3 ships, M2 inspector behavior, M0 / M1 / M2 adopter feedback, and the build-step adopter pool will all inform a clearer answer.

## Decisions

(To be filled during M3 design. Anchored decisions:)

- **2026-05-06** — Tokens are stored in `.deloop/tokens.json` in DTCG v1 format. Other formats are build outputs, not source.
- **2026-05-06** — Themes are token overrides within the same DTCG structure, not separate files.
- **2026-05-06** — CSS custom properties is the default build output. Other outputs are opt-in via `.deloop/config.ts`.

## Out of scope (M3)

- Visual regression testing on token changes (post-M3).
- Multi-format token export beyond CSS / Tailwind / SCSS in V1.
- Cross-project / cross-team token sharing or sync.
- Round-tripping token edits to external tools (Figma, Tokens Studio).
- Programmatic / API-driven token editing (file edits and the UI are the only paths).

## Linked ADRs / Plans

- `docs/prd/foundation.md` — vision; tokens are framed as the core differentiator.
- `docs/prd/m0-spatial-canvas.md` — the canvas this milestone closes the loop on.
- `docs/prd/m2-screens.md` — Tailwind-first inspector; coordinates with this milestone's Tailwind config output.

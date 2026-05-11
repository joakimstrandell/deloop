# M3 — Tokens and Themes

Status: Draft

## Problem Statement

Foundation argues that the canvas without token editing is a spatial Storybook — useful, but missing the value that makes Deloop Deloop. The core feedback loop the product exists to deliver is:

> Arrange components spatially → tweak a design token or switch a theme → see the ripple across everything instantly.

M0 ships the spatial canvas; M1 and M2 deepen the experience around it. M3 closes the loop: tokens become a first-class design knob, themes become switchable, and a build step emits the formats consuming apps actually use.

This is also the most architecturally heavy milestone. Token formats are a multi-tool ecosystem (DTCG, Tailwind config, CSS custom properties, SCSS variables, Tokens Studio). Theme semantics interact with the canvas iframe's CSS injection model. The build step is a real piece of build tooling, not a UI surface. Land this carefully, after M0 / M1 / M2 have validated the canvas surface.

## Solution

Deloop owns `.deloop/tokens.json` in DTCG v1 format as the canonical source of truth. A live token editor renders per-type controls (colour picker, spacing slider, typography selector, radius input, shadow editor); editing a value injects an updated CSS custom property directly into the canvas iframe's `:root`, updating every dependent Card simultaneously without reload. Themes are named overrides within the same DTCG structure — switching themes globally or per Card uses the same CSS variable injection path. A build step transforms DTCG JSON into `.deloop/dist/tokens.css` on every change (default); Tailwind config and SCSS variables are opt-in additional outputs via `.deloop/config.ts`. On first run with no token file, Deloop scaffolds a minimal DTCG structure and offers a one-time import from detected sources (Tailwind config, CSS custom properties, Tokens Studio JSON).

A user with no `.deloop/tokens.json` boots Deloop and gets a working scaffold. Editing a colour value in the token panel updates every Card that uses that colour, instantly. Switching the global theme from `light` to `dark` flips every Card's theme tokens on the same tick. A Card configured with a per-Card theme override renders independently from the global theme. After a token edit, `.deloop/dist/tokens.css` is updated on disk; configuring `outputs: ["css", "tailwind"]` produces both `tokens.css` and `tailwind.tokens.js` on every token edit. Importing from an existing Tailwind config produces a DTCG file the user can immediately edit.

## User Stories

- As a developer, I want to boot Deloop in a project with no `.deloop/tokens.json` and get a working scaffold, so that I can start editing tokens immediately.
- As a developer, I want to edit a colour value in the token panel and see every dependent Card update instantly, so that the canvas-token feedback loop is the design loop.
- As a developer, I want per-type controls (colour picker, spacing slider + numeric input, font selector + size / weight / leading inputs, radius numeric input, composite shadow editor), so that I edit each token at the level I usually think in.
- As a developer, I want to switch the global theme from `light` to `dark` and see every Card flip on the same tick, so that I can evaluate the system under either theme without reload.
- As a developer, I want a per-Card theme override (Card-level), so that I can render the same component side-by-side under multiple themes for comparison.
- As a developer, I want `.deloop/dist/tokens.css` regenerated on every token edit, so that my consuming app's build pipeline always sees fresh values.
- As a developer, I want `outputs: ["css", "tailwind"]` in `.deloop/config.ts` to also produce `tailwind.tokens.js` (v3) or a v4 CSS `@theme` block, so that my Tailwind project can pick up the same values without manual sync.
- As a developer, I want `outputs: ["css", "scss"]` to also emit `tokens.scss`, so that SCSS-based pipelines can consume the same source.
- As a developer, I want a one-time import from an existing Tailwind config / CSS custom properties / Tokens Studio JSON on first run, so that I can adopt Deloop without rewriting my tokens by hand.
- As a developer, I want common context providers (`@tanstack/react-query` → `QueryClientProvider`, `react-router` → `MemoryRouter`) auto-detected from `package.json` and offered as canvas wrappers, so that the canvas matches my app's runtime without per-shim provider boilerplate.

## Implementation Decisions

- **DTCG v1 at `.deloop/tokens.json` is the canonical source of truth.** Other formats are build outputs, not source. The CLI ensures the file exists and reads it on every boot. On first run with no token file, Deloop scaffolds a minimal DTCG structure.
- **Themes are token overrides within the same DTCG structure**, not separate files. A `light` theme and a `dark` theme share the same token keys but provide different values.
- **CSS custom properties is the default build output** (`dist/tokens.css`). Other outputs (Tailwind config `dist/tailwind.tokens.js`, SCSS variables `dist/tokens.scss`) are opt-in via `.deloop/config.ts`. The build is incremental and runs on token edit; consumers reference `dist/` outputs in their app build pipelines.
- **Theme switching uses the CSS variable injection path** used by individual token edits — instant, no reload, layered on top of the canvas iframe's existing style entry.
- **Tailwind output adapts to project version.** v4 emits a CSS `@theme` block; v3 emits a JS config mergeable into `tailwind.config.*`. Detected from `package.json`.
- **One-time import.** On first run with no `tokens.json` but recognisable token sources elsewhere in the project (Tailwind config, CSS custom properties at the top of a stylesheet, a Tokens Studio JSON), Deloop offers to scaffold the DTCG file from the detected source. Best-effort, one-time, user-reviewable; subsequent edits flow through the DTCG file.
- **Provider auto-detection** (related). Common context providers are auto-detected from `package.json` and offered as canvas wrappers. The `.deloop/config.ts` wrapper component remains the escape hatch for custom cases. Bundled here because it lands the broader "make the canvas feel like the user's app" deeper.

## Testing Decisions

- **Unit** — DTCG parser, token → CSS variable transformer, Tailwind v3/v4 emitter selection, import-source detection.
- **Integration** — token edit → CSS variable injection → canvas iframe update; build-step incremental output to `.deloop/dist/`; conflict handling between in-editor and in-UI token edits.
- **E2E** — first-run scaffold, edit → instant ripple across Cards, global and per-Card theme override, `outputs: ["css", "tailwind"]` producing both files, import from Tailwind config.

See [docs/agent/testing.md](../agent/testing.md).

## Out of Scope

- Token-management product on its own — this milestone exists in service of the canvas feedback loop, not as a standalone replacement for Tokens Studio or Style Dictionary.
- Tailwind-only product call. M2's inspector is Tailwind-first; M3 may produce Tailwind config as one output among several. Whether Deloop's broader product positioning is Tailwind-only is decided after M3 ships and adopter feedback lands.
- Collaborative / multi-user token editing. Tokens live on disk; conflicts are Git's job.
- Visual regression testing on token changes (post-M3).
- Multi-format token export beyond CSS / Tailwind / SCSS in V1.
- Cross-project / cross-team token sharing or sync.
- Round-tripping token edits to external tools (Figma, Tokens Studio).
- Programmatic / API-driven token editing (file edits and the UI are the only paths).

## Further Notes

- **Mode integration.** Does Tokens / Themes get its own mode in the M1 chassis, or live as a panel reachable from any mode? The canvas-wide value of token edits argues for a panel that's available alongside whatever mode is active, not a dedicated Tokens mode. Decide during M3 design.
- **Tailwind v3 vs v4 robustness.** Tailwind v4 changes the config story significantly (CSS-defined `@theme` blocks). The build step needs explicit handling for both — supported versions and adapter behaviour need design.
- **DTCG superset.** The W3C DTCG v1 spec is stable but lean. Some Deloop concerns (theme overrides, semantic / primitive token distinction, token aliases across themes) may need a clearly-namespaced superset. Land minimal DTCG; extend as gaps emerge.
- **Token file ownership and editor concurrency.** If the user edits `tokens.json` in their editor while Deloop has it open, the same write-back contention as Screens applies. Use the same mtime / version-detection pattern from M2.
- **Tailwind-only product call revisited.** This milestone is the natural moment to revisit the question. By the time M3 ships, M2 inspector behavior, M0 / M1 / M2 adopter feedback, and the build-step adopter pool will all inform a clearer answer.

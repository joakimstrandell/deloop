# Deloop Foundation

**Status:** Draft (v0)
**Author:** Joakim Strandell  
**Last updated:** 2026-04-28

---

## Problem

Designing UI components in code today lacks the spatial, iterative quality of a design tool. You work in an editor, mentally simulate what the code produces, wait for a dev server refresh, and switch between tabs to evaluate the result. There is no overview, no side-by-side comparison of states, and no direct manipulation of the design system layer that drives the components.

The core issue is not a lack of tools -- it is a lack of _spatial awareness_. Figma gives designers an infinite canvas where they can see an entire system at once: every component, every state, every variant laid out and comparable. Developers have nothing equivalent. The editor is a list of files. Storybook is a list of stories. The browser is a single viewport. The moment you want to evaluate visual rhythm across ten component states, or see how a spacing token change ripples through your whole system, you are back in Figma, arranging rectangles that are not real code.

Existing tools solve parts of this:

- **Figma** gives you canvas feel and spatial overview, but produces designs that must be re-implemented in code. Everything is built twice.
- **Storybook** renders components in isolation but is primarily a documentation and QA tool, not a design iteration environment. No canvas, no spatial layout, no live token editing.
- **Design token tools** (Tokens Studio, Style Dictionary) manage tokens but are disconnected from live component preview. Editing a token does not update rendered components.
- **AI-native builders** (v0, Bolt, Lovable) generate components from prompts but produce new code rather than working with an existing codebase. They are generation tools, not workbenches.

None of these tools treat code as the design medium _and_ give you the spatial experience of a design tool. They either replace code (Figma, AI builders) or wrap it without changing how it feels to work with it (Storybook, token tools).

The market has validated this problem repeatedly. Backlight.dev (code-first, framework-agnostic component workbench) and Interplay (code component canvas) both attempted closely related products and both shut down in 2025 -- not because the problem was wrong, but because the specific combination of capabilities and a sustainable business model proved difficult. A new wave of better-funded entrants (Paper, Onlook, Glue, Rivet -- several YC-backed) is now attacking adjacent parts of the problem, which confirms the space is real and competitive.

---

## Competitive positioning

The product occupies a specific gap that no current tool fills:

**vs. Paper (paper.design):** Paper is a design tool built on real HTML/CSS -- its canvas renders web standards, not proprietary vectors. Code is outputted from Paper, not inputted into it. Paper owns the source of truth. This product is the inverse: files on disk are the source of truth, and the tool is a pure renderer. Paper cannot render your existing React components from your codebase.

**vs. Storybook:** Storybook renders real components from disk and is framework-agnostic. This product agrees with that approach entirely. The difference is the experience layer: Storybook is a developer tool with a sidebar/list UI. This product adds a spatial canvas, pages, frames, and a live token editor. The two tools are potentially complementary rather than directly competitive. Storybook compatibility (CSF story files) is a pragmatic interoperability question, not a strategic one -- if reading CSF files is cheap and lowers friction, it is worth supporting; if it is expensive and distracts from the canvas experience, it can wait.

**vs. Onlook:** Onlook overlays a visual editor on a running web app, mapping edits back to source files. Strong code-as-truth philosophy, but it is an editor overlay rather than a canvas renderer, and has no token editing layer.

**vs. Tokens Studio:** Tokens Studio manages and syncs design tokens but previews them in Figma, not in a code component renderer. The token editing in this product is coupled to live component rendering -- that coupling is the core value that Tokens Studio does not provide.

**The compound gap:** No existing tool gives you a spatial canvas with pages and frames + live token editing and theme switching with instant CSS hot-reload + token build outputs for multiple formats + app views for in-context validation + real React components rendered from disk + code as the source of truth. This specific combination is unoccupied.

---

## Product vision

**Deloop** -- a tool for building design systems and themes in code, with the spatial immediacy of a design tool.

Deloop's core value is a single, tightly coupled feedback loop:

**Arrange components spatially on a canvas -- tweak a design token or switch a theme -- see the ripple across everything instantly.**

Neither the canvas nor the token editor is the product in isolation. The canvas without token editing is a spatial Storybook. Token editing without the canvas is another token tool. The value is in the coupling: changing a semantic color token, switching from light to dark theme, and watching thirty component cards update simultaneously while zoomed out, looking at the whole system.

This loop serves three modes of work:

1. **Building a design system from scratch** -- write a component in your editor (or generate it with an LLM), drag it onto the canvas, configure multiple instances with different props and pseudo-states to see every variant at once, tweak tokens until the system feels right.
2. **Building and validating themes** -- define multiple themes (light, dark, brand variants) as named sets of token values, and render the same components under different themes side by side to verify the system holds together across all contexts.
3. **Refining an existing system** -- lay out the full component library spatially, change a token value, and evaluate the impact across the entire system in one view.

In addition to the component canvas, Deloop can embed **app views** -- running instances of apps that consume the design system. App views are read-only iframes pointing to locally running dev servers. They let the user verify that design system decisions (token changes, theme switches) look right in the context of real, routed applications. The experimentation happens in component mode; app views are for validation.

Components and compositions (components that compose other components) are treated identically by Deloop. A signup form that uses a heading, text inputs, and a button is just another component on disk. Deloop discovers and renders it the same way. This means the user can verify that the design system works not just at the primitive level but also in realistic compositions -- without any special feature for compositions.

The tool does not write business logic. It does not replace an editor or an LLM. It owns one specific layer: the rendering environment, the token values, and the theme definitions. Everything else -- writing component code, prompting an LLM, managing files -- happens outside the tool, in whatever workflow the user already has.

---

## Core concepts

### Code is the source of truth

Component files live on disk in the user's project. Deloop is installed as a dev dependency in the project and started with a CLI command (`deloop` or similar). It watches the filesystem and re-renders on change. It does not manage, store, or export component code. The user's editor and version control are the canonical environment for code.

### Tokens and themes are the design knobs

Deloop owns the design token layer. Tokens are stored in `.deloop/tokens.json` in DTCG-format -- this is the single source of truth for the design system's token values. Editing a token value in the UI immediately updates all rendered components via CSS variable injection into the canvas document. No save, no rebuild.

Token files follow the W3C DTCG v1 specification (reached stable status October 2025), providing a stable, tool-agnostic foundation for token interoperability. Users with tokens in other formats (Tailwind config, CSS custom properties, Tokens Studio) can import them into the DTCG structure on first run. If the DTCG spec proves insufficient for specific use cases, the tool may extend it with a clearly namespaced superset rather than diverging from the standard.

Because apps consume tokens in different formats (CSS custom properties, Tailwind config, SCSS variables), Deloop includes a **token build step** that transforms DTCG JSON into one or more output formats. Build outputs are written to `.deloop/dist/` and can be referenced by consuming apps. CSS custom properties is the default output format; additional formats (Tailwind, SCSS) are configured in `.deloop/config.ts`.

Themes are named sets of token overrides within the same DTCG structure. A `light` theme and a `dark` theme share the same token keys but provide different values. The canvas can apply a theme globally (all component cards render under one theme) or per card (the same button rendered in light and dark side by side). Theme switching is instant -- it is the same CSS variable injection mechanism used for individual token edits.

### The canvas is the design surface

Components are placed on a free, infinite canvas -- not in a list, not in a scrollable page. The canvas can be zoomed and panned. Multiple components and multiple prop configurations of the same component can be arranged spatially and viewed simultaneously. The canvas is implemented as a full-document iframe, giving it complete style isolation from the tool chrome and a faithful reproduction of the component's real runtime environment.

The canvas supports **pages** (separate named canvases, switchable via tabs) and **frames** (rectangular grouping regions within a page). These are organizational primitives that let users structure their spatial layout -- one page per component family, frames to group related variants, or any other arrangement that fits their mental model.

### Component preview

Clicking a component in the sidebar opens a dedicated preview canvas for that component. The preview renders the component in its default state. The user can then toggle which variants and pseudo-states to display -- e.g. show the `primary` and `secondary` variants, in `hover` and `focus` states -- and the tool renders a card for each selected combination in a structured grid. The user drives the selection; the tool does not attempt to enumerate every possible combination automatically. This keeps the preview focused and avoids combinatorial explosion for components with many props.

### Input method is irrelevant

The tool does not care how the component code was written -- by hand, generated by Claude Code or any other LLM, or copied from somewhere. It renders whatever is on disk. LLMs interact with the tool the same way any other process does: by editing files on disk. They are one input method among others, not a feature of the tool itself.

---

## Users and jobs to be done

Deloop serves a specific _job_, not a specific persona. The job is:

**"I need to build and validate a design system -- see how components hold together visually across states and themes, verify it works in real apps, and tweak the system in place."**

This job arises in three contexts:

### Building a new system

A developer is creating components from scratch. They write a button, drag it onto the canvas, create instances for every state (default, hover, focus, active, disabled), and iterate on the design tokens until it feels right. They repeat this for each component, arranging them spatially to evaluate consistency. Deloop replaces the cycle of: edit code, switch to browser, refresh, mentally compare with what came before.

### Refining an existing system

A developer working within an established design system needs to evaluate the impact of a token change across the full library. They lay out the relevant components on the canvas, adjust a semantic token, and see the ripple everywhere at once. Deloop replaces the cycle of: change a variable, rebuild, click through Storybook stories one by one, try to remember what changed.

### Validating in context

A developer has built or updated a design system and needs to see how it looks in real applications. They switch to an app view -- a running app that consumes the design system -- and navigate through it while tweaking tokens and switching themes. Deloop replaces the cycle of: change a token, rebuild, boot the app, click through pages, try to remember how it looked before.

### Who experiences this job

- **Design engineers** -- developers with strong design sensibility who work directly in code and iterate by eye. They have opinions about spacing, typography, and motion. They do not want a Figma-to-code pipeline. They want to design in code without losing the feedback loop that Figma provides.
- **Frontend engineers** working within an established design system who need to verify components against tokens and review visual consistency across states.

Both arrive at the same tool for the same reason. The difference is setup complexity (simple project vs. complex codebase with providers and build tooling), not the core job.

This job-to-be-done is validated by market activity: multiple YC-backed companies (Glue, Onlook, Rivet, Tempo) in 2025 -- 2026 are explicitly targeting the convergence of design and engineering into a single "design engineer" or "builder" role.

---

## Application layout

Deloop's UI follows a familiar IDE / design tool layout:

- **Top bar** -- project name, page tabs, zoom controls, global actions
- **Left sidebar** -- component list; discovered components are listed here and dragged onto the canvas
- **Canvas** -- the central area; a full-document iframe that fills the remaining space
- **Right sidebar** -- props panel for the selected component instance (including pseudo-state toggles)

The outer document (top bar, sidebars) is the tool chrome. It uses its own scoped styles (Tailwind with a `wb-` prefix) and is completely isolated from the canvas iframe. No styles leak between the two contexts.

---

## Features

### P0 -- The spatial canvas

P0 is focused on one thing: get real React components from disk onto a spatial canvas with configurable props and states. No token editing, no themes, no app views. Design tokens are edited in source code (Tailwind config, CSS files, or whatever the project uses) and Deloop picks up the changes via HMR. The spatial canvas is the product's identity -- it is what makes Deloop Deloop.

**CLI entry point**  
The tool is installed as a dev dependency (`npm install --save-dev @deloop/cli` or similar) and started with a single command in the project root. It spins up a local Vite-based dev server, opens Deloop in the default browser, and watches for file changes.

**Component discovery**  
Components are discovered by convention (e.g. any `.tsx` file exporting a default React component under `src/components/`) with optional override via `.deloop/config.ts`. The config can specify component directories, style entry points, and project-level setup (providers, global CSS imports). On first run with no config, the tool applies sensible defaults and renders whatever it can find.

Known edge cases to handle in v1: barrel files, re-exports, `forwardRef` wrappers. Explicitly out of scope for v1: components requiring build-time transforms with non-standard configs (e.g. custom CSS Modules setups).

**Component list sidebar**  
The left sidebar lists all discovered components. Components can be dragged from the list onto the canvas.

**Canvas -- infinite, zoomable, pannable**  
The canvas is a full-document iframe. Inside it, a container div holds all component cards and is transformed for zoom (CSS `scale`) and pan (CSS `translate`). Zoom via pinch or scroll wheel, pan via drag on empty canvas space.

**Drag-and-drop canvas placement**  
Dragging a component from the sidebar onto the canvas creates a component card at that position. Multiple cards of the same component can coexist on the canvas with independent prop and pseudo-state configurations. Multiple different components can coexist on the same page.

**Canvas style environment**  
The canvas iframe loads the project's own styles -- Tailwind output, CSS custom properties, font imports, resets -- exactly as they would be loaded in the real app. Components render in a faithful reproduction of their production environment. Style entry points are configured via `.deloop/config.ts`.

**TypeScript prop inference**  
Props are inferred statically from the component's TypeScript types at startup, using `react-docgen-typescript` or equivalent. The right sidebar renders a control per prop: string -> text input with autocomplete, string union -> select, boolean -> toggle, number -> number input. Complex or unsupported prop types fall back to a raw JSON editor. No manual story or prop definition file required.

**Pseudo-state controls**  
Each component card in the canvas can be set to a specific interactive state: hover, focus, focus-visible, active, disabled. These states are forced via CSS pseudo-class injection (e.g. applying the `:hover` styles without requiring actual mouse interaction) so that every state can be viewed statically and side by side.

**Pages**  
The canvas supports multiple named pages, switchable via tabs in the top bar. The data model supports future addition of frames (grouping regions within pages) without rearchitecting.

**Component hot-reload**  
The local Vite server watches component files on disk. On change, HMR pushes the update into the canvas iframe and the affected component cards re-render. No manual refresh.

**Canvas state persistence**  
Component positions, zoom level, per-card prop/pseudo-state configurations, and page structure are stored in `.deloop/canvas.json` alongside the project. This file is gitignored by default (the CLI adds it on first run). Team sharing of canvas layouts is a future consideration.

---

### P1 -- Deepen the experience

**Component preview mode**  
Clicking a component in the left sidebar opens a dedicated preview canvas for that component. The preview initially renders the component in its default state. The user selects which variants (prop values) and pseudo-states to display, and the tool renders a card for each selected combination in a grid layout. This is user-driven, not automatic -- the user picks what to show. The preview canvas is separate from the user's manual spatial canvas and is useful for quickly evaluating a component across states without arranging cards by hand.

**Live token editing**  
The right sidebar includes a token editor panel. It reads the project's DTCG-format JSON token file (`.deloop/tokens.json`) and renders controls per token type: color picker for colors, slider + numeric input for spacing and radius, font selector for typography. Editing any value injects an updated CSS custom property directly into the canvas iframe's `:root` -- all rendered components update simultaneously with no reload. Tokens are organized into groups (color, spacing, typography, effects).

**Token file integration**  
Deloop owns the token file at `.deloop/tokens.json` in DTCG format. This is the canonical source of truth for design system tokens. On first run with no token file, the tool scaffolds a minimal DTCG structure. Import from other formats (CSS custom properties, Tailwind config, Tokens Studio) is supported as a one-time onboarding step.

**Token build step**  
Deloop transforms DTCG JSON into consumable output formats and writes them to `.deloop/dist/`. CSS custom properties is the default output format, generated automatically on every token change. Additional formats (Tailwind config, SCSS variables) can be configured in `.deloop/config.ts`.

**Theme support**  
Multiple themes (light, dark, brand variants) defined as named sets of token overrides in the DTCG token file. Themes can be switched globally or per component card. Theme switching uses the same CSS variable injection mechanism as individual token edits -- instant, no reload.

**Frames**  
Rectangular grouping regions within a page. Frames can be labelled, resized, and repositioned. They are visual containers that help organize component cards spatially -- one frame per component family, or any other arrangement that fits the user's mental model.

**App views**  
Deloop can embed running applications that consume the design system as read-only iframes. Apps are configured in `.deloop/config.ts` by name and localhost URL. The user starts the app's dev server separately; Deloop embeds it. Token edits and theme switches are injected into app view iframes via the same CSS variable mechanism used for the component canvas.

**Provider auto-detection**  
Automatically detect common context providers from `package.json` dependencies (e.g. `@tanstack/react-query` -> `QueryClientProvider`, `react-router` -> `MemoryRouter`) and offer to wrap the canvas environment with them. The `.deloop/config.ts` wrapper component (analogous to Storybook's `decorators`) remains available for custom cases.

---

### P2 -- Nice to have

**CSF compatibility**  
Support Storybook's Component Story Format as an optional story file format.

**Multi-framework support**  
v1 ships React only. Svelte support is the first planned addition. The framework is detected automatically from `package.json`.

**Token diff view**  
Shows token values changed in the current session vs. values on disk. Allows selective commit or revert.

**Viewport presets**  
Render component cards inside a resizable viewport frame for testing responsive behavior.

**Motion preview**  
Play/pause/scrub control per component card for animated components.

**Visual regression snapshots**  
Snapshot the canvas and compare against a baseline. Potential CI integration and monetization surface.

**Shared canvas layouts**  
Option to commit `.deloop/canvas.json` to version control for team sharing. Requires a merge-friendly format to avoid conflicts.

---

## Architecture

### Overview

```
your-project/
  .deloop/
    config.ts               ← Deloop configuration
    canvas.json             ← canvas state (pages, positions, props, zoom)
  src/
    components/             ← watched by file watcher
  package.json              ← framework detected from here
```

Running `deloop` in the project root starts a Node.js process that serves the Deloop browser app, runs a Vite dev server for the components, and watches the filesystem.

### Local server (Node.js)

- Serves the Deloop UI (outer chrome -- top bar, sidebars)
- Runs a Vite instance configured for the detected framework (React in v1) with the project's dependencies available
- Watches component files via chokidar; triggers HMR on change
- Exposes a WebSocket channel for real-time communication with the browser

### Browser -- outer document (tool chrome)

- Top bar (with page tabs), left sidebar, right sidebar
- Styled with Tailwind using a `wb-` prefix -- zero collision risk with project styles
- Communicates with the canvas iframe via `postMessage`
- Sends prop updates, pseudo-state changes, and zoom/pan commands to the iframe
- Receives selection events and canvas state updates from the iframe

### Browser -- canvas iframe

- A separate browser document, completely isolated from the tool chrome
- Loads the project's CSS entry point (Tailwind output, CSS custom properties, fonts, resets) -- components render in their real environment
- Receives component mount/unmount commands, prop updates, and pseudo-state forcing via `postMessage`
- Implements zoom and pan as CSS `scale` and `translate` on a root container div

### TypeScript prop inference

At startup, the server statically analyses component files using `react-docgen-typescript`. The extracted prop schema (name, type, required, default, description) is sent to the browser and used to render the props panel controls. Re-analysed on component file change.

### MCP compatibility

No built-in LLM features in v1. However, the local server exposes a lightweight MCP server interface so that any agent (Claude Code, Cursor, Codex, etc.) can read canvas state without special integration. LLMs edit component files on disk like any other tool; the file watcher picks up the changes and the canvas updates. This is an architectural constraint, not a future feature.

---

## Out of scope (P0)

- Design token editing in the tool UI (edit tokens in source code; Deloop picks up changes via HMR)
- Theme switching and management
- Token file ownership, DTCG format, or build step
- App views (embedded running applications)
- Multi-framework rendering within a single Deloop instance
- Svelte, Vue, or vanilla JS support (designed for, not built)
- Code editing inside the tool
- Built-in LLM / AI features
- Component documentation generation
- Design handoff / inspection mode
- Collaborative / multiplayer canvas
- Cloud sync or remote hosting
- Visual regression testing
- Frames (grouping regions within pages -- data model supports future addition)

---

## Open questions

1. **Complex component dependencies:** How does the tool handle components that require React context providers, global stores, or router context? The `.deloop/config.ts` can specify a wrapper component (analogous to Storybook's `decorators`). The first-run experience for projects with complex dependencies needs explicit design -- if nothing renders until the user writes a config, adoption will suffer.

2. **Monetization model:** Both Backlight.dev and Interplay -- the two closest precedents -- failed as standalone SaaS products despite building genuinely useful tools. Options include: open-source core with paid cloud features (visual regression testing, shared canvas sync), a per-seat commercial license, a one-time purchase, or positioning as infrastructure for a larger product. A working hypothesis should be established before significant investment so that architecture decisions can be evaluated against it.

3. **Success metrics:** What does "working" look like after launch? Adoption targets, retention benchmarks, time-to-first-render goals, and canvas engagement metrics need to be defined so that the P0 feature set can be evaluated against them.

---

## Known constraints

### Canvas performance

Deloop renders real React components with real DOM, real CSS, and real layout -- not GPU-painted pixels like Figma. This is fundamentally more expensive per element. A canvas with twenty buttons will be trivial. A canvas with hundreds of complex components will hit the browser's rendering ceiling.

This is a scaling constraint, not an architectural problem. The v1 approach is naive rendering: every component card is a live React tree, always. This will work well for typical usage (tens of component cards visible at once) and keeps the implementation simple.

When real users hit the performance ceiling, the mitigation path is **snapshot virtualisation**: render each component card once, rasterise it to a static image, and display the image when zoomed out or when the card is off-screen. Swap the live component back in when the user zooms in close enough to interact. This is a rendering optimisation layered on top of the existing iframe model -- it does not require rearchitecting the canvas. The iframe and `postMessage` architecture supports this approach without changes.

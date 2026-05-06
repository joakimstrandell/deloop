# Deloop Foundation

**Status:** Active
**Author:** Joakim Strandell
**Last updated:** 2026-05-06

This is Deloop's vision document. It owns the problem statement, competitive positioning, mode taxonomy, and language. Per-milestone scope and acceptance criteria live in `mN-*.md` PRDs alongside this file. Unscheduled initiatives live as unprefixed PRDs.

---

## Problem

Designing UI components in code today lacks the spatial, iterative quality of a design tool. You work in an editor, mentally simulate what the code produces, wait for a dev-server refresh, and switch tabs to evaluate the result. There is no overview, no side-by-side comparison of states, and no direct manipulation of the design system layer that drives the components.

The core issue is not a lack of tools — it is a lack of _spatial awareness_. Figma gives designers an infinite canvas where they can see an entire system at once: every component, every state, every variant laid out and comparable. Developers have nothing equivalent. The editor is a list of files. Storybook is a list of stories. The browser is a single viewport. The moment you want to evaluate visual rhythm across ten component states, or see how a spacing-token change ripples through your whole system, you are back in Figma, arranging rectangles that are not real code.

Existing tools solve parts of this:

- **Figma** gives you canvas feel and spatial overview, but produces designs that must be re-implemented in code. Everything is built twice.
- **Storybook** renders components in isolation but is primarily a documentation and QA tool, not a design iteration environment. No canvas, no spatial layout, no live token editing.
- **Design token tools** (Tokens Studio, Style Dictionary) manage tokens but are disconnected from live component preview.
- **AI-native builders** (v0, Bolt, Lovable) generate components from prompts but produce new code rather than working with an existing codebase.

None of these tools treat code as the design medium _and_ give you the spatial experience of a design tool. They either replace code (Figma, AI builders) or wrap it without changing how it feels to work with it (Storybook, token tools).

The market has validated this problem repeatedly. Backlight.dev (code-first, framework-agnostic component workbench) and Interplay (code component canvas) both attempted closely related products and shut down in 2025 — not because the problem was wrong, but because the specific combination of capabilities and a sustainable business model proved difficult. A new wave of better-funded entrants (Paper, Onlook, Glue, Rivet — several YC-backed) is now attacking adjacent parts of the problem, which confirms the space is real and competitive.

---

## Competitive positioning

The product occupies a specific gap that no current tool fills:

**vs. Paper (paper.design):** Paper is a design tool built on real HTML/CSS — its canvas renders web standards, not proprietary vectors. Code is outputted from Paper, not inputted into it. Paper owns the source of truth. Deloop is the inverse: files on disk are the source of truth, and the tool is a renderer (with one scoped exception — Screen files, see ADR-0008). Paper cannot render existing React components from a codebase.

**vs. Storybook:** Storybook renders real components from disk and is framework-agnostic. Deloop agrees with that approach entirely. The difference is the experience layer — Storybook is a developer tool with a sidebar/list UI; Deloop adds a spatial canvas, modes, and a live token editor. The two tools are potentially complementary rather than directly competitive.

**vs. Onlook:** Onlook overlays a visual editor on a running web app, mapping edits back to source files. Strong code-as-truth philosophy, but it is an editor overlay rather than a canvas renderer, and has no token editing layer.

**vs. Tokens Studio:** Tokens Studio manages and syncs design tokens but previews them in Figma, not in a code component renderer. Deloop's token editing is coupled to live component rendering — that coupling is the core value.

**The compound gap:** No existing tool combines a spatial canvas + a code-driven sketch surface (Screens) + live token editing and theme switching with instant CSS hot-reload + token build outputs for multiple formats + app views for in-context validation + real React components rendered from disk + code as the source of truth. This specific combination is unoccupied.

---

## Product vision

**Deloop** — a tool for building design systems and themes in code, with the spatial immediacy of a design tool.

Deloop's core value is a single, tightly coupled feedback loop:

**Arrange components spatially on a canvas — tweak a design token or switch a theme — see the ripple across everything instantly.**

Neither the canvas nor the token editor is the product in isolation. The canvas without token editing is a spatial Storybook. Token editing without the canvas is another token tool. The value is in the coupling: changing a semantic color token, switching from light to dark theme, and watching dozens of component cards update simultaneously while zoomed out, looking at the whole system.

This loop serves four modes of work, each represented as a top-level mode in the Shell.

---

## Modes

Deloop exposes four orthogonal modes (see ADR-0006). Each mode owns its own selection state, sidebar contents, and canvas semantics. The mode-switcher chassis lands in M1.

- **Pages** — the spatial canvas. Drag components from the sidebar onto an infinite, zoomable, pannable canvas; arrange them in named Pages; configure props and pseudo-states per Card. The home of free spatial composition. Shipped in M0.
- **Components** — Component Preview. Click a component in the sidebar to see it on its own focused canvas; pick which variants and pseudo-states to display; the tool auto-arranges Cards in a structured grid. Lands in M1.
- **Screens** — design-in-code. Author screens as `*.screen.deloop.tsx` files (see ADR-0007); render them full-canvas with hover outlines and node selection; edit Tailwind utility classes per-node through a Tailwind-first inspector that writes back to the source file (see ADR-0008). Lands in M2.
- **Apps** — embedded running applications, with token / theme overrides injected via `postMessage`. Validates that design-system decisions hold up in production-shaped layouts. Currently unscheduled — depends on M3 (live token editing) for unique value.

---

## Core concepts

### Code is the source of truth

Component files live on disk in the user's project. Deloop is installed as a dev dependency and started with a CLI command (`deloop`). It watches the filesystem and re-renders on change. It does not manage, store, or export component code. The user's editor and version control are the canonical environment for code.

There is one scoped exception (ADR-0008): for `*.screen.deloop.tsx` files, Deloop's Screens-mode inspector may write back to source character-precisely. All other files (component sources, shims, configuration, app code) remain editor-only.

### Tokens and themes are the design knobs

Deloop owns the design-token layer. Tokens are stored in `.deloop/tokens.json` in DTCG v1 format — the single source of truth for the design system's token values. Editing a token value in the UI immediately updates all rendered components via CSS variable injection. No save, no rebuild.

Themes are named sets of token overrides within the same DTCG structure. The canvas can apply a theme globally (all Cards under one theme) or per Card (the same button rendered in light and dark side by side). Theme switching uses the same CSS variable injection mechanism — instant.

A token build step transforms DTCG JSON into output formats consumed by apps (CSS custom properties by default; Tailwind config or SCSS variables opt-in). See `m3-tokens-and-themes.md`.

### The canvas is the design surface

Components are placed on a free, infinite canvas — zoomable, pannable. Multiple components and prop configurations of the same component can be arranged spatially and viewed simultaneously. The canvas is implemented as a full-document iframe (ADR-0001), giving it complete style isolation from the Shell and a faithful reproduction of the component's real runtime environment.

The canvas supports **Pages** (separate named canvases, switchable via tabs). **Frames** (rectangular grouping regions within a Page) are designed for but unscheduled.

### Input method is irrelevant

Deloop does not care how component code was written — by hand, generated by an LLM, copied from somewhere. It renders whatever is on disk. LLMs interact with the tool the same way any other process does: by editing files. They are one input method among others, not a feature of the tool itself.

---

## Users and jobs to be done

Deloop serves a specific _job_, not a specific persona:

> "I need to build and validate a design system — see how components hold together visually across states and themes, verify it works in real apps, and tweak the system in place."

This job arises in three contexts:

- **Building a new system.** A developer creates components from scratch, drags them onto the canvas, creates instances for every state, and iterates on tokens until it feels right.
- **Refining an existing system.** A developer adjusts a semantic token and sees the ripple across the full library laid out spatially.
- **Validating in context.** A developer sees how the system looks in real applications via Apps mode (when M3 lands).

### Who experiences this job

- **Design engineers** — developers with strong design sensibility who work directly in code and iterate by eye. They have opinions about spacing, typography, motion. They want to design in code without losing the feedback loop Figma provides.
- **Frontend engineers** working within an established design system who need to verify components against tokens and review visual consistency across states.

This job-to-be-done is validated by market activity: multiple YC-backed companies (Glue, Onlook, Rivet, Tempo) in 2025–2026 are explicitly targeting the convergence of design and engineering into a single "design engineer" or "builder" role.

---

## Application layout

Deloop's UI follows a familiar IDE / design-tool layout:

- **Top bar** — project name, mode switcher (Pages / Components / Screens / Apps), zoom, global actions.
- **Left sidebar** — mode-aware. In Pages mode: the Pages list (above) and the Components palette (below). In Components mode: the Components list. In Screens mode: the Screens list. In Apps mode: the apps list.
- **Canvas** — the central surface. A full-document iframe; what it renders is mode-dependent.
- **Right sidebar** — tabbed panel chassis (see ADR-0009). `Props` and `Style` tabs; each mode picks which tabs are visible and which is the default.

The Shell uses standard Tailwind without prefixes; isolation between Shell and canvas comes from the iframe boundary, not class scoping.

---

## Architecture

### Overview

```
your-project/
  .deloop/
    config.ts               ← Deloop configuration
    canvas.json             ← canvas state per mode (positions, props, zoom)
    tokens.json             ← DTCG tokens (M3)
    dist/                   ← token build outputs (M3)
  src/
    components/             ← *.deloop.tsx shims watched here
    screens/ (convention)   ← *.screen.deloop.tsx Screen files
  package.json              ← framework detected from here
```

Running `deloop` in the project root starts a Node.js process that serves the Deloop browser app, runs a Vite dev server for the components, and watches the filesystem.

### Local server (Node.js)

- Serves the Deloop UI (Shell — top bar, sidebars).
- Runs a Vite instance configured for the detected framework (React in V1) with the project's dependencies available (ADR-0002).
- Watches component and screen files via chokidar; triggers HMR on change.
- Pushes discovery events to the Shell over Server-Sent Events (ADR-0004).

### Browser — Shell (outer document)

- Top bar with mode switcher, left sidebar, right sidebar.
- Standard Tailwind; isolation from the canvas via iframe boundary (ADR-0001).
- Communicates with the canvas iframe via `postMessage`. Message protocol contract lives in `packages/app/src/types.ts`.

### Browser — canvas iframe

- A separate browser document, completely isolated from the Shell.
- Loads the project's CSS entry point (Tailwind output, custom properties, fonts, resets) — components render in their real environment.
- Receives mount / unmount commands, prop updates, pseudo-state forcing, and (M3) token / theme injection via `postMessage`.
- Implements zoom / pan as CSS `scale` / `translate` on a root container div.
- Deloop's chrome (card frames, labels, error UI) lives in a shadow root inside the iframe to avoid colliding with project CSS.

### MCP compatibility

No built-in LLM features. The local server exposes a lightweight MCP server interface so any agent (Claude Code, Cursor, Codex) can read canvas state without special integration. LLMs edit component files on disk like any other tool; the file watcher picks up the changes and the canvas updates. This is an architectural constraint, not a future feature.

---

## Open questions

- **Monetization model.** Both Backlight.dev and Interplay — the closest precedents — failed as standalone SaaS products. Options: open-source core with paid cloud features (visual regression, shared canvas sync), per-seat commercial license, one-time purchase, or positioning as infrastructure for a larger product. A working hypothesis should be established before significant investment so architecture decisions can be evaluated against it.
- **Success metrics.** What does "working" look like after launch? Adoption targets, retention benchmarks, time-to-first-render goals, canvas engagement metrics — to be defined so the M-series can be evaluated.
- **Tailwind-only product call.** M2's Screens inspector is Tailwind-first, not Tailwind-only. Whether Deloop as a product commits to Tailwind-only is decided later — likely during M3 design with adopter feedback as input.

---

## Known constraints

### Canvas performance

Deloop renders real React components with real DOM, real CSS, and real layout — not GPU-painted pixels like Figma. This is fundamentally more expensive per element. A canvas with twenty buttons is trivial. A canvas with hundreds of complex components will hit the browser's rendering ceiling.

This is a scaling constraint, not an architectural problem. M0 ships naive rendering: every Card is a live React tree, always. This works for typical usage (tens of Cards visible at once) and keeps implementation simple.

When real users hit the ceiling, the mitigation is **snapshot virtualisation**: rasterise each Card to a static image when zoomed out or off-screen; swap the live component back when zoomed in. This is a rendering optimisation layered on top of the existing iframe model — no rearchitecting needed.

---

## Future considerations

Items not currently scheduled to a milestone, kept here for visibility:

- **Frames** — rectangular grouping regions within Pages.
- **CSF compatibility** — read Storybook Component Story Format files as an optional second discovery channel.
- **Multi-framework support** — Svelte first, then Vue / vanilla.
- **Token diff view** — show token values changed in the current session vs. on disk; selective commit / revert.
- **Viewport presets** — render Cards inside a resizable viewport frame for testing responsive behaviour.
- **Motion preview** — play / pause / scrub control per Card for animated components.
- **Visual regression snapshots** — snapshot the canvas, compare against a baseline. Potential CI integration and monetization surface.
- **Shared canvas layouts** — option to commit `.deloop/canvas.json` to version control for team sharing. Requires a merge-friendly format.

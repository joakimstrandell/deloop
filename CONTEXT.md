# Deloop

Design system workbench: a spatial canvas for rendering real React components from a user's project, with live token editing and isolated canvas rendering.

## Language

### Surfaces

**Shell**:
The outer browser document — top bar, sidebars, top-level chrome. Lives in `packages/app/src/shell/`.
_Avoid_: outer app, host

**Canvas**:
The full-document iframe where user components actually render. Style-isolated from the shell by browser semantics.
_Avoid_: preview frame, sandbox

**User project**:
The project Deloop is run against (where `process.cwd()` points at runtime). Source of components, tokens, screens, and Vite config.
_Avoid_: target project, host project, consumer

### Modes

The Shell exposes orthogonal **modes** (see ADR-0006), each owning its own selection state, sidebar contents, and canvas semantics. Modes are exposed via a top-bar segmented control; the mode-switcher chassis lands in M1.

**Pages mode**:
The spatial canvas. Drag Component entries from the sidebar onto an infinite canvas; arrange Cards in named Pages; configure props and pseudo-states per Card. Shipped in M0.
_Avoid_: canvas mode (ambiguous — every mode uses a canvas)

**Page**:
A named canvas within Pages mode that holds a Card arrangement. The user creates, renames, and switches between Pages from the left-sidebar Pages list (above the Components palette). Each Page owns its own zoom / pan and Card layout. Distinct from `Pages mode` — a Page is an instance the mode hosts.
_Avoid_: tab, sheet, frame

**Components mode**:
Component Preview. A focused per-component view that renders a structured grid of Cards across user-picked variants and pseudo-states. Lands in M1.
_Avoid_: preview mode, variant view

**Screens mode**:
Design-in-code. Renders Screen entries full-canvas with hover outlines and node selection; the Inspector edits Tailwind utility classes per-node and writes back to source (see ADR-0008). Lands in M2.
_Avoid_: design mode, sketch mode

**Apps mode**:
Embedded running applications, with token / theme overrides injected via `postMessage`. Currently unscheduled.
_Avoid_: live preview, runtime mode

### Components

**Component entry**:
A discovered record describing one Deloop-aware file: `{ name, path, relativePath, kind }`. Metadata only — never source code. The `kind` field (Shim or Screen) determines which mode lists the entry. Populates the mode-aware sidebar.
_Avoid_: component metadata, component descriptor, component item

**Component module**:
The transformed JS/TSX module served by Vite at the entry's `path`. Hot-swapped via Vite HMR. Consumed by the canvas iframe via dynamic `import()`.
_Avoid_: component code, component bundle

**Card**:
A live-rendered instance of a Component module placed on the canvas. Each card has a stable `cardId` and props. One component module can be rendered as many cards. Used in Pages mode (free arrangement) and Components mode (auto-arranged grid). Screens mode renders one Screen as a single full-canvas instance, not a Card.
_Avoid_: instance, preview, tile

**Shim file**:
A `*.deloop.tsx` file (the default kind, no kind infix) that declares what Deloop renders on the canvas. Each named export becomes one Component entry of kind Shim; the export identifier (verbatim) is the entry's `name`. Default exports are ignored. Empty shims produce zero entries. See ADR-0005 for the strict shim-only discovery model.
_Avoid_: story file, example file, deloop story

**Screen file**:
A `*.screen.deloop.tsx` file that declares a code-driven design surface for Screens mode. The default export is rendered full-canvas. Files may compose design-system components, define inline ad-hoc components, and contain plain JSX with utility classes. Each Screen file produces one Component entry of kind Screen. See ADR-0007 for the kind-infix file convention; see ADR-0008 for the scoped write-back rules.
_Avoid_: page file, layout file, view

**Standalone component**:
A Component entry of kind Shim that is meaningful as a single Card (Button, Hero). The default for any discovered component without composition concerns.
_Avoid_: leaf, primitive

**Slot component**:
A Component entry only meaningful as a descendant of a specific Compound parent (TooltipTrigger, AccordionItem). Not a valid standalone Card target — typically not given its own Shim file; surfaces only as part of a Compound's shim composition.
_Avoid_: child component, sub-component

**Compound component**:
A Component entry of kind Shim whose useful rendering requires Slot children (Tooltip, Accordion). Typically exposed via a Shim file that composes it with default Slots and any required providers (e.g. `TooltipProvider` wrapping a `Tooltip`).
_Avoid_: parent component, container component

**Inspector**:
The content of the **Style tab** in the right-sidebar panel chassis (see ADR-0009), used in Screens mode. Exposes per-node Tailwind utility editing for the selected DOM node within a rendered Screen. Tailwind-first (parses utility classes for structured controls); non-Tailwind elements remain class-editable as raw text. See `m2-screens.md`.
_Avoid_: style panel, properties panel, sidebar panel

### Events

**Discovery event**:
A change to the _set_ of component entries — a file appearing (`add`) or disappearing (`unlink`). Emitted by the file watcher and pushed to the shell over SSE. Does not include content changes.
_Avoid_: file change, watch event, component update

## Relationships

- A **User project** contains many **Component entries**, sourced from **Shim files** (named exports) and **Screen files** (default export per file).
- A **Component entry** has a `kind` (Shim or Screen) that determines which **Mode** lists it.
- A **Component entry** points to exactly one **Component module**.
- A **Component module** can be mounted as zero or more **Cards** in Pages mode and Components mode. In Screens mode, a Screen entry's module renders as a single full-canvas instance, not a Card.
- The **Shell** owns the list of **Component entries**; the **Canvas** owns the **Cards** and the rendered Screen.
- A **Discovery event** mutates the **Shell**'s set of **Component entries**, never the **Cards**.
- **Shim** and **Screen** are the only kinds today; the kind-infix file convention (ADR-0007) is the extension point for future kinds.
- **Standalone**, **Slot**, and **Compound** describe the *role* a Shim-kind Component entry plays in a design system; Slot entries are typically composed inside a Compound shim rather than exposed on their own.
- The **Inspector** in Screens mode reads the rendered DOM and writes back to the **Screen file** (the only file kind Deloop edits, per ADR-0008).

## Example dialogue

> **Dev:** "When the user edits a component's padding in their editor, what updates?"
> **Domain expert:** "The **Component module** is recompiled by Vite and hot-swapped into every **Card** rendering it. The **Component entry** doesn't change — same name, same path. No **Discovery event** fires."

> **Dev:** "And if they create a new shim `card.deloop.tsx` exporting `Card`?"
> **Domain expert:** "The watcher fires a **Discovery event** with the new **Component entry** (kind Shim). The **Shell** appends it to the Pages-mode sidebar. Nothing renders on the **Canvas** until someone drags it in."

> **Dev:** "What if they create `signup.screen.deloop.tsx`?"
> **Domain expert:** "Same pipeline, but the entry's kind is Screen. It appears in the Screens-mode sidebar, not Pages. Selecting it renders the file's default export full-canvas, with the **Inspector** available on the right sidebar. Editing a Tailwind class through the Inspector writes back to the Screen file character-precisely."

## Flagged ambiguities

- "component" was used ambiguously for both the on-disk file metadata and the rendered instance — resolved: **Component entry** for the metadata, **Card** for the rendered instance, **Component module** for the transformed code.
- "mode" was previously informal — formalised as the four named modes (Pages, Components, Screens, Apps) in ADR-0006.

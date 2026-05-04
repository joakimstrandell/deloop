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
The project Deloop is run against (where `process.cwd()` points at runtime). Source of components, tokens, and Vite config.
_Avoid_: target project, host project, consumer

### Components

**Component entry**:
A discovered record describing one component file: `{ name, path, relativePath }`. Metadata only — never source code. This is what populates the sidebar list.
_Avoid_: component metadata, component descriptor, component item

**Component module**:
The transformed JS/TSX module served by Vite at the entry's `path`. Hot-swapped via Vite HMR. Consumed by the canvas iframe via dynamic `import()`.
_Avoid_: component code, component bundle

**Card**:
A live-rendered instance of a component module placed on the canvas. Each card has a stable `cardId` and props. One component module can be rendered as many cards.
_Avoid_: instance, preview, tile

**Shim file**:
A `*.deloop.tsx` file co-located with a component file (e.g. `Tooltip.deloop.tsx` next to `Tooltip.tsx`) that defines what Deloop renders on the canvas for that name. Its `default` export becomes the primary renderable; named exports become Variants. When a shim file exists, the bare component file is suppressed from discovery — the shim is the source of truth.
_Avoid_: story file, example file, deloop story

**Variant**:
An additional sidebar entry produced from a named export of a shim file. Surfaces in the sidebar as `<Component> (<variant>)` (e.g. "Button (outline)", "Button (ghost)"). Used to expose multiple meaningful configurations of the same component.
_Avoid_: story, example, preset

**Standalone component**:
A component entry that is meaningful as a single Card (Button, Hero). The default for any discovered component without composition concerns.
_Avoid_: leaf, primitive

**Slot component**:
A component entry only meaningful as a descendant of a specific compound parent (TooltipTrigger, AccordionItem). Not a valid standalone Card target — typically excluded from discovery either by absence of default export or by an opt-out mechanism.
_Avoid_: child component, sub-component

**Compound component**:
A component entry whose useful rendering requires Slot children (Tooltip, Accordion). Typically exposed via a Shim file that composes it with default Slots.
_Avoid_: parent component, container component

### Events

**Discovery event**:
A change to the _set_ of component entries — a file appearing (`add`) or disappearing (`unlink`). Emitted by the file watcher and pushed to the shell over SSE. Does not include content changes.
_Avoid_: file change, watch event, component update

## Relationships

- A **User project** contains many **Component entries**, one per discovered file (or per Shim export)
- A **Component entry** points to exactly one **Component module**
- A **Component module** can be mounted as zero or more **Cards** on the **Canvas**
- The **Shell** owns the list of **Component entries**; the **Canvas** owns the **Cards**
- A **Discovery event** mutates the **Shell**'s set of **Component entries**, never the **Cards**
- A **Shim file** overrides the bare component file with the same base name; one Shim can produce a primary entry plus zero or more **Variant** entries
- **Standalone**, **Slot**, and **Compound** are kinds a Component entry can take; Slot entries are typically not exposed in the sidebar

## Example dialogue

> **Dev:** "When the user edits a component's padding in their editor, what updates?"
> **Domain expert:** "The **Component module** is recompiled by Vite and hot-swapped into every **Card** rendering it. The **Component entry** doesn't change — same name, same path. No **Discovery event** fires."

> **Dev:** "And if they create a new file `Card.tsx` in `src/components/`?"
> **Domain expert:** "The watcher fires a **Discovery event** with the new **Component entry**. The **Shell** appends it to the sidebar. Nothing renders on the **Canvas** until someone drags it in."

## Flagged ambiguities

- "component" was used ambiguously for both the on-disk file metadata and the rendered instance — resolved: **Component entry** for the metadata, **Card** for the rendered instance, **Component module** for the transformed code.

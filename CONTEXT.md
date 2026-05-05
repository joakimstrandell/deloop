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
A `*.deloop.tsx` file (e.g. `tooltip.deloop.tsx`, optionally co-located with the component file or in a separate folder) that declares what Deloop renders on the canvas. Each named export becomes one Component entry; the export identifier (verbatim) is the entry's `name`. Default exports are ignored. Empty shims (no named exports) produce zero entries. See ADR-0005 for the strict shim-only discovery model.
_Avoid_: story file, example file, deloop story

**Standalone component**:
A component entry that is meaningful as a single Card (Button, Hero). The default for any discovered component without composition concerns.
_Avoid_: leaf, primitive

**Slot component**:
A component entry only meaningful as a descendant of a specific compound parent (TooltipTrigger, AccordionItem). Not a valid standalone Card target — typically not given its own Shim file; surfaces only as part of a Compound's shim composition.
_Avoid_: child component, sub-component

**Compound component**:
A component entry whose useful rendering requires Slot children (Tooltip, Accordion). Typically exposed via a Shim file that composes it with default Slots and any required providers (e.g. `TooltipProvider` wrapping a `Tooltip`).
_Avoid_: parent component, container component

### Events

**Discovery event**:
A change to the _set_ of component entries — a file appearing (`add`) or disappearing (`unlink`). Emitted by the file watcher and pushed to the shell over SSE. Does not include content changes.
_Avoid_: file change, watch event, component update

## Relationships

- A **User project** contains many **Component entries**, one per **Shim** named export
- A **Component entry** points to exactly one **Component module**
- A **Component module** can be mounted as zero or more **Cards** on the **Canvas**
- The **Shell** owns the list of **Component entries**; the **Canvas** owns the **Cards**
- A **Discovery event** mutates the **Shell**'s set of **Component entries**, never the **Cards**
- A **Shim file** is the only source of **Component entries** — bare component files are not discovered
- **Standalone**, **Slot**, and **Compound** are kinds a Component entry can take; Slot entries are typically composed inside a Compound shim rather than exposed on their own

## Example dialogue

> **Dev:** "When the user edits a component's padding in their editor, what updates?"
> **Domain expert:** "The **Component module** is recompiled by Vite and hot-swapped into every **Card** rendering it. The **Component entry** doesn't change — same name, same path. No **Discovery event** fires."

> **Dev:** "And if they create a new shim `card.deloop.tsx` exporting `Card`?"
> **Domain expert:** "The watcher fires a **Discovery event** with the new **Component entry**. The **Shell** appends it to the sidebar. Nothing renders on the **Canvas** until someone drags it in. A bare `Card.tsx` on its own would not produce an entry — only shims are discovered."

## Flagged ambiguities

- "component" was used ambiguously for both the on-disk file metadata and the rendered instance — resolved: **Component entry** for the metadata, **Card** for the rendered instance, **Component module** for the transformed code.

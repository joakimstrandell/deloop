# ADR-0001: Iframe canvas isolation

**Status:** Accepted
**Date:** 2026-03-31

## Context

The canvas needs to render real React components with real CSS, fonts, and styles from the
user's project. A core requirement is that the tool chrome (sidebars, top bar) never interferes
with the component rendering environment — styles must not leak in either direction.

Two approaches were considered:

1. **Same-document rendering** — components render inside a `<div>` in the main document,
   with heavy CSS scoping to prevent collisions.
2. **Full-document iframe** — components render inside a separate `<iframe>` that is its own
   browser document, with its own `<head>`, stylesheets, and JavaScript context.

## Decision

Use a full-document iframe for the canvas.

The iframe loads the user's project CSS (Tailwind output, CSS custom properties, fonts, resets)
exactly as it would be loaded in a real app. Components render in a faithful production
environment. No scoping hacks are needed.

## Consequences

**Better:**
- Complete style isolation with zero effort — the browser enforces it.
- Components render in their real environment: correct fonts, resets, custom properties.
- Token hot-reload works via `postMessage` → CSS variable injection into the iframe's `:root`.
- Future snapshot virtualisation (rasterising cards at zoom-out) is straightforward on top
  of this model.

**Worse:**
- Communication between shell and canvas must go through `postMessage` — slightly more
  infrastructure than direct DOM access.
- Reaching inside the iframe in Playwright tests requires `frameLocator` — small but real
  testing overhead.
- Same-origin restrictions apply; the iframe must be served from the same origin as the shell.

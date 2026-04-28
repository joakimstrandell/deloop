# Plan 0001: Bootstrap monorepo

**Status:** Implemented
**Date:** 2026-03-31

## Context

Starting Deloop from scratch. Goal is to go from an empty directory to a rendered React
component from `packages/sample-app` inside the canvas iframe, with HMR working.

This plan proves the hardest architectural question — can Deloop serve user project files
inside a Vite-powered iframe — before building product on top.

## Approach

Full pnpm workspace monorepo from day one, matching the final published structure.
See ADR-0003 for the monorepo decision, ADR-0001 for iframe isolation, ADR-0002 for
the Vite programmatic API approach.

The proof-of-concept path:
1. CLI starts a Vite dev server (programmatic API)
2. Vite server has `server.fs.allow` set to include `packages/sample-app/`
3. Shell app fetches `/api/components` and displays the list
4. Clicking a component sends a `MOUNT_COMPONENT` postMessage to the iframe
5. Iframe dynamically imports the component via Vite's `/@fs/` path prefix
6. Component renders in the iframe

## Packages

- `packages/cli` — `@deloop/cli` — Node.js server + CLI entry
- `packages/app` — `@deloop/app` — Vite React app (shell + iframe entries)
- `packages/sample-app` — simulated user project, depends on `@deloop/cli: workspace:*`

## Key technical detail: dynamic component imports

User components are absolute filesystem paths (e.g. `/path/to/Button.tsx`). Browsers cannot
import filesystem paths directly. Vite's `/@fs/` prefix transforms an absolute path into a
Vite-served URL that is transpiled through the plugin pipeline:

```
/@fs/absolute/path/to/Button.tsx
→ Vite transforms TSX → valid ES module
→ Browser imports it
```

This requires the path to be within `server.fs.allow`.

## Files created

See git log for the full list. Key files:
- `CLAUDE.md` — agent instructions
- `docs/adr/000[1-5]-*.md` — five architecture decisions
- `packages/cli/src/` — server, component discovery, Vite instance
- `packages/app/src/shell/` — shell UI (component list, layout)
- `packages/app/src/iframe/` — canvas iframe (dynamic component mounting)
- `packages/sample-app/` — test fixture simulating a user project

## Verification

1. `pnpm install` from repo root — workspace deps resolve cleanly
2. `cd packages/sample-app && pnpm dev` — browser opens to Deloop
3. Sidebar shows "Button"
4. Click Button — iframe renders the component
5. Edit `packages/sample-app/src/components/Button.tsx` — iframe updates via HMR

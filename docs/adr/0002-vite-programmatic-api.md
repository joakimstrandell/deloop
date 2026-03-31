# ADR-0002: Vite programmatic API for component serving

**Status:** Accepted
**Date:** 2026-03-31

## Context

Deloop needs to serve the user's React components in an iframe. The components are TypeScript/TSX
files on disk; they need to be transpiled, bundled (HMR-aware), and served to the browser.
The user's project may have its own Vite config or other build setup.

Options considered:

1. **Vite plugin** — Deloop is a Vite plugin that the user adds to their own `vite.config.ts`.
   Deloop's UI is served as an additional route.
2. **Programmatic Vite server** — Deloop starts its own Vite instance via `createServer()`,
   configured to allow access to the user's project files via `server.fs.allow`.
3. **esbuild or Rollup directly** — Use a lower-level bundler to transpile components
   on demand without the full Vite dev server.

## Decision

Use Vite's programmatic API (`createServer()` from the `vite` package) to start an isolated
Vite dev server. The server:
- Has its `root` set to Deloop's own app directory.
- Has `server.fs.allow` expanded to include the user's project root (`process.cwd()`).
- Uses `resolve.dedupe` to ensure a single React instance across Deloop and user components.
- Runs in `middlewareMode: true` so it can be embedded in Deloop's Express server.

User components are served via Vite's `/@fs/` path prefix, which allows the browser to import
absolute filesystem paths that are within the allowed directories.

## Consequences

**Better:**
- HMR works naturally — Vite watches files and pushes updates to the iframe.
- TypeScript, JSX, and CSS transforms are handled by Vite's plugin pipeline.
- No changes required to the user's own build config.
- The iframe renders components in a proper Vite dev environment with source maps.

**Worse:**
- The app root calculation (finding Deloop's `packages/app/` relative to the CLI binary)
  requires careful path resolution, especially when the CLI is published to npm.
- `resolve.dedupe` for React must be correct; multiple React instances cause runtime errors.
- Complex user project configurations (custom CSS Module setups, unusual transforms) may
  not be compatible without explicit support in Deloop's Vite config.

# ADR-0003: pnpm workspaces monorepo

**Status:** Accepted
**Date:** 2026-03-31

## Context

Deloop requires at minimum two separately publishable packages:

- `@deloop/cli` — the Node.js server process, published to npm
- `@deloop/app` — the browser UI assets, bundled with or served by the CLI

Additionally, `packages/sample-app` simulates a real user project that consumes `@deloop/cli`,
providing a realistic integration test environment without requiring an external project.

Options considered:

1. **Single package** — simpler initially, but requires restructuring before publishing.
2. **npm workspaces** — standard but slower than pnpm, weaker isolation.
3. **pnpm workspaces** — fast, excellent isolation via strict node_modules layout,
   `workspace:*` protocol for cross-package references.

## Decision

Use pnpm workspaces with the following packages:

- `packages/cli` — `@deloop/cli`
- `packages/app` — `@deloop/app`
- `packages/sample-app` — simulated user project (not published)

`packages/sample-app` depends on `@deloop/cli: "workspace:*"`, meaning it references the local
CLI package directly. Running `deloop` from within `packages/sample-app/` tests the real CLI
invocation path with real module resolution.

Canvas state (`.deloop/canvas.json`) is gitignored by default. Team sharing of canvas layouts
is a future consideration (see P1 features in the PRD).

## Consequences

**Better:**

- Clear package boundaries enforce the architectural constraint that CLI never imports browser
  APIs and app never imports Node.js APIs.
- `sample-app` faithfully tests the real user experience, including `workspace:*` resolution.
- pnpm's strict node_modules layout surfaces accidental cross-package imports early.

**Worse:**

- Requires pnpm; contributors need it installed globally.
- First-time setup is slightly more complex than a single package.

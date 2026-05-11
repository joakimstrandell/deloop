# ADR-0003: pnpm workspaces monorepo

**Status:** Accepted
**Date:** 2026-03-31

## Context

Deloop requires at minimum two separately publishable packages:

- `@deloop/cli` — the Node.js server process, intended for npm (not yet published; currently used locally from this repo)
- `@deloop/app` — the browser UI assets, bundled with or served by the CLI

Additionally, `@deloop/ui` doubles as the dogfood target: a shared design system that's also
the canonical local example the CLI is exercised against, giving us a realistic integration
environment without requiring an external project.

Options considered:

1. **Single package** — simpler initially, but requires restructuring before publishing.
2. **npm workspaces** — standard but slower than pnpm, weaker isolation.
3. **pnpm workspaces** — fast, excellent isolation via strict node_modules layout,
   `workspace:*` protocol for cross-package references.

## Decision

Use pnpm workspaces with the following packages:

- `packages/cli` — `@deloop/cli`
- `packages/app` — `@deloop/app`
- `packages/ui` — `@deloop/ui` (shared design system, also the dogfood target)

`@deloop/app` depends on `@deloop/ui: "workspace:*"`, referencing the local design system
directly. The CLI is exercised against `@deloop/ui` from the repo root with
`pnpm --filter @deloop/cli dev --root "$PWD/packages/ui"`, testing the real CLI invocation
path with real module resolution.

Canvas state (`.deloop/canvas.json`) is gitignored by default. Team sharing of canvas layouts
is a future consideration (see [docs/prd/foundation.md](../prd/foundation.md) under Future
considerations).

## Consequences

**Better:**

- Clear package boundaries enforce the architectural constraint that CLI never imports browser
  APIs and app never imports Node.js APIs.
- `@deloop/ui` provides realistic dogfooding of the real user experience (including
  `workspace:*` resolution) while remaining a real product surface, not a throwaway fixture.
- pnpm's strict node_modules layout surfaces accidental cross-package imports early.

**Worse:**

- Requires pnpm; contributors need it installed globally.
- First-time setup is slightly more complex than a single package.

## Amendments

- **2026-05-11** — package list updated to reflect current layout (sample-app removed, @deloop/ui added).

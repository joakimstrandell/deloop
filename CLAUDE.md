# Deloop

Design system workbench — spatial canvas for rendering React components with live token editing.

See PRD: `~/Downloads/PRD-Deloop-v0.8.md`

## Terminology

- **Shell** — the outer UI wrapper (top bar, sidebars). Lives in `packages/app/src/shell/`.
  Not to be confused with Google Chrome or the Chromium browser.
- **Canvas iframe** — a completely isolated browser document that renders user components.
  Lives in `packages/app/src/iframe/`.
- **User project** — the project Deloop is installed into; its root is `process.cwd()` at runtime.

## Architecture invariants — never break these

- The canvas is a full-document iframe. Shell and canvas are separate browser documents.
  Communicate **only via postMessage**. Never share state, styles, or module references across
  the boundary.
- Deloop runs **from within the user's project** (`cwd` = user project root).
  The Vite server uses `server.fs.allow` to access user files. Never assume a fixed project path.
- `packages/cli` must never import browser APIs.
- `packages/app` must never import Node.js APIs.
- Shell and canvas both use standard Tailwind (no prefix). The iframe boundary is a hard
  browser guarantee — CSS cannot cross document boundaries. File location signals context.

## postMessage contract

Message types are a bilateral contract between shell and iframe. The authoritative definitions
live in `packages/app/src/types.ts`. Never change a message type without updating both sender
(shell) and receiver (iframe) in the same commit.

## Plans and ADRs

### Feature plans

Every non-trivial feature gets a plan written **before implementation**. Plans live in
`docs/plans/` numbered sequentially (e.g. `0002-component-discovery.md`). A plan must include:

- Why this feature is being built (context)
- The chosen approach and key alternatives rejected
- Files to create or modify
- Verification steps

Plans are written in plan mode before implementation begins, then committed to the repo.

### Architecture Decision Records

Key architectural decisions are documented as ADRs in `docs/adr/`. Format:

```
# ADR-NNNN: Title
Status: Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```

Write an ADR when a decision is significant, non-obvious, or likely to be questioned later.

**Never edit an accepted ADR's decision text.** If a decision proves wrong, write a new ADR
that supersedes it and update the original's status line. The audit trail is the value.

## Testing — when and how

### Which discipline applies where

**TDD (red-green-refactor)** applies to `packages/cli/src/` modules with clear inputs/outputs:
`component-discovery.ts`, `token-manager.ts`, server API endpoints. Use the
`test-driven-development` skill for these. Write the failing test first.

**TDD does NOT apply to:**
- Exploratory/spike work (e.g. proving Vite can serve iframe content). Do the spike, stabilize
  the interface, then write tests against the stable interface.
- E2E tests — these are post-feature by nature.
- UI components in `packages/app/src/` — validate via E2E.

### Triggers

- New module in `packages/cli/src/` → TDD. Failing unit test before any implementation.
- Change to postMessage handling → update unit test for message validation.
- New user-facing feature → Playwright E2E test in `e2e/tests/`.

### How to write E2E tests

Use `e2e/tests/component-render.spec.ts` as the canonical pattern. Key points:

- Deloop starts automatically via `playwright.config.ts` `webServer` config.
- Reach inside the canvas iframe using `page.frameLocator('iframe#canvas')`.
- To test HMR: write to the file using Node `fs`, then assert on DOM change with `waitForSelector`.
- Assert on **visible behavior**, not implementation details (class names, DOM structure).

### Exploratory validation

Use the `webapp-testing` skill (Python Playwright) for quick one-off checks while building.
These scripts are throwaway — not committed. Once validated, write the committed test in
`e2e/tests/` using `@playwright/test` (TypeScript).

### Before marking a feature done — in order

1. `pnpm check` — Oxlint + Oxfmt (VitePlus) or `tsc --noEmit`. Zero warnings.
2. `pnpm test:unit` — all Vitest unit tests pass.
3. `pnpm test:e2e` — relevant Playwright E2E tests pass.
4. `/simplify` — review changed code before committing.

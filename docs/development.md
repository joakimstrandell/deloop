# Development

## Prerequisites

- Node.js `>=24`
- `pnpm`

## Setup

```bash
pnpm install
```

## Run locally

Start Deloop with the sample app fixture:

```bash
pnpm --filter @deloop/sample-app dev
```

Default URL: `http://localhost:4242`

## Validation commands

From repo root:

```bash
pnpm check
pnpm test:unit
pnpm install:browsers
pnpm test:e2e
```

## Repository layout

- `packages/cli`: Node CLI and server runtime
- `packages/app`: shell and iframe browser app
- `packages/sample-app`: local fixture app for integration testing
- `packages/ui`: shared UI package

## Workflow

- Linear is the source of truth for feature scope and acceptance criteria.
- Default delivery model is one issue per branch/worktree and one PR per issue.
- See `docs/agent/workflow.md` and `docs/agent/testing.md` for full agent workflow details.

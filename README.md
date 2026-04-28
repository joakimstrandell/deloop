# Deloop

Deloop is a design system workbench: a spatial canvas for rendering real React components from your project in an isolated iframe.

## Current Project Status

This repository is currently set up for local development usage. The CLI package is not published yet.

## Use Deloop (local/dev setup)

### Requirements

- Node.js `>=24`
- `pnpm`

### Start Deloop against the sample app

```bash
pnpm install
pnpm --filter @deloop/sample-app dev
```

Then open `http://localhost:4242` if it does not open automatically.

### Run Deloop against another local project

From this repo, run:

```bash
pnpm --filter @deloop/cli dev -- --root /absolute/path/to/your/project --port 4242 --no-open
```

CLI options:

- `--root`, `-r`: project root to inspect (defaults to current directory)
- `--port`, `-p`: server port (default `4242`)
- `--open` / `--no-open`: control browser auto-open

## What Deloop does today

- Starts an Express server with embedded Vite middleware
- Discovers React components from `src/components/**/*.tsx`
- Shows discovered components in the shell sidebar
- Mounts selected components into an isolated canvas iframe

## Troubleshooting

- Port already in use: run with `--port <another-port>`
- Playwright tests failing on missing browser: run `pnpm install:browsers`
- Type or build checks: run `pnpm check`

## Development

For contributor setup and workflow, see `docs/development.md`.

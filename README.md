# Deloop

Deloop lets you build design systems in code with the speed and spatial feel of a design canvas.

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

## Current limitations (P0)

- Currently tested and supported with React 19.x projects
- Component discovery is currently focused on `src/components/**/*.tsx`
- CLI distribution is not published yet (local/dev usage from this repo)
- Token editing, theme management, and advanced canvas capabilities are not in scope yet

## Compatibility

- Currently tested and supported: React 19.x
- React 18 support is planned and intended, but not yet guaranteed in this repository

## Troubleshooting

- Port already in use: run with `--port <another-port>`
- Playwright tests failing on missing browser: run `pnpm install:browsers`
- Type or build checks: run `pnpm check`

## Development

For contributor setup and workflow, see `docs/development.md`.

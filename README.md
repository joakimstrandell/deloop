# Deloop

Deloop lets you build design systems in code with the speed and spatial feel of a design canvas.

## Current Project Status

This repository is currently set up for local development usage. The CLI package is not published yet.

## Use Deloop (local/dev setup)

### Requirements

- Node.js `>=24`
- `pnpm`

### Start Deloop against the bundled `@deloop/ui` design system

Deloop dogfoods its own components — this is also the canonical local example.

```bash
pnpm install
pnpm --filter @deloop/cli dev --root "$PWD/packages/ui" --port 4242 --no-open
```

Then open `http://localhost:4242`.

### Run Deloop against another local project

From this repo, run:

```bash
pnpm --filter @deloop/cli dev --root /absolute/path/to/your/project --port 4242 --no-open
```

CLI options:

- `--root`, `-r`: project root to inspect (defaults to current directory)
- `--port`, `-p`: server port (default `4242`)
- `--open` / `--no-open`: control browser auto-open

## What Deloop does today

- Starts an Express server with embedded Vite middleware
- Discovers React components from `src/components/**/*.deloop.tsx` shim files
- Shows discovered components in the shell sidebar
- Mounts selected components into an isolated canvas iframe

## Shim convention

Every component renderable on the canvas declares itself in a `*.deloop.tsx` shim file. The default discovery glob is `src/components/**/*.deloop.tsx`; configure additional sources via `.deloop/config.ts`. Each named export of a shim becomes one sidebar entry whose displayed name is the export identifier verbatim. Default exports are ignored. See [ADR-0005](docs/adr/0005-strict-shim-only-discovery.md) for the rationale.

Two canonical examples ship in `@deloop/ui`:

`packages/ui/src/components/button.deloop.tsx` — trivial-leaf shim:

```tsx
import { Button as BaseButton } from "./button.js";

export function Button() {
  return <BaseButton>Button</BaseButton>;
}
```

`packages/ui/src/components/tooltip.deloop.tsx` — compound + provider:

```tsx
import { Button as BaseButton } from "./button.js";
import {
  Tooltip as BaseTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip.js";

export function Tooltip() {
  return (
    <TooltipProvider delayDuration={0}>
      <BaseTooltip>
        <TooltipTrigger asChild>
          <BaseButton variant="outline">Hover me</BaseButton>
        </TooltipTrigger>
        <TooltipContent>Tooltip content</TooltipContent>
      </BaseTooltip>
    </TooltipProvider>
  );
}
```

## Current limitations

- Currently tested and supported with React 19.x projects
- Component discovery is shim-only (`*.deloop.tsx`); bare `.tsx` files do not appear in the sidebar
- CLI distribution is not published yet (local/dev usage from this repo)
- Only the spatial canvas (Pages mode) is shipped today. Component Preview, Screens, and live token editing are on the roadmap — see `docs/prd/` for milestone PRDs.

## Compatibility

- Currently tested and supported: React 19.x
- React 18 support is planned and intended, but not yet guaranteed in this repository

## Troubleshooting

- Port already in use: run with `--port <another-port>`
- Playwright tests failing on missing browser: run `pnpm install:browsers`
- Type or build checks: run `pnpm check`

## Development

For contributor setup and workflow, see `docs/development.md`.

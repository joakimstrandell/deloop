import { createServer as createHttpServer } from "node:http";
import { exec } from "node:child_process";
import express, { type Response } from "express";
import {
  createViteComponentServer,
  resolveUserPath,
  type CanvasStyleConfig,
} from "./vite-component-server.js";
import { createComponentRegistry } from "./component-watcher.js";
import { autoDetectStylesPath, loadDeloopConfig } from "./config-loader.js";
import { bootstrapDeloopDir } from "./bootstrap.js";

export interface ServerOptions {
  root: string;
  port: number;
  open: boolean;
}

/**
 * SSE keep-alive interval. Browsers and intermediate proxies tend to drop
 * idle connections at the 30–60s mark; a comment frame every 25s keeps the
 * channel open without producing visible events.
 */
const SSE_KEEPALIVE_MS = 25_000;

export async function startServer({ root, port, open }: ServerOptions): Promise<void> {
  const app = express();
  const httpServer = createHttpServer(app);

  console.log(`[deloop] Starting with project root: ${root}`);

  const created = await bootstrapDeloopDir(root);
  if (created.length > 0) {
    console.log(`[deloop] Initialized ${created.join(", ")}`);
  }

  const config = (await loadDeloopConfig(root)) ?? {};
  const registry = await createComponentRegistry(
    root,
    config.components !== undefined ? { components: config.components } : {},
  );

  const style = resolveCanvasStyleConfig(root, config.styles, config.componentsDir);
  if (style.cssPaths.length > 0) {
    console.log(`[deloop] Loading canvas styles from ${style.cssPaths.join(", ")}`);
  } else {
    warnNoCssResolved();
  }

  const vite = await createViteComponentServer(root, style);

  // REST API — first paint of the sidebar reads this once. Subsequent
  // updates flow through the SSE channel below.
  app.get("/api/components", async (_req, res) => {
    const components = await registry.list();
    res.json(components);
  });

  // Server-Sent Events — pushes a `discovery` event with the full Component
  // entry list whenever a file is added or removed under the configured
  // sources. See `docs/adr/0004-sse-for-server-to-shell-push.md` for the
  // duplex-vs-broadcast reasoning.
  app.get("/api/events", (_req, res) => {
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Nginx-style proxy buffering if anything sits in front; SSE
      // requires the response to flush per-frame.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    function send(event: string, data: unknown): void {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }

    // Periodic comment frame — keeps proxies and browsers from idling out
    // the connection. Comments are ignored by EventSource consumers.
    const keepAlive = setInterval(() => {
      res.write(`: keepalive\n\n`);
    }, SSE_KEEPALIVE_MS);

    const unsubscribe = registry.subscribe((components) => {
      send("discovery", components);
    });

    const close = (): void => {
      clearInterval(keepAlive);
      unsubscribe();
    };
    _onSseClose(res, close);
  });

  // Vite middleware handles all other requests (app, HMR, /@fs/ paths)
  app.use(vite.middlewares);

  httpServer.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`[deloop] Running at ${url}`);

    if (open) {
      const cmd =
        process.platform === "darwin"
          ? `open ${url}`
          : process.platform === "win32"
            ? `start ${url}`
            : `xdg-open ${url}`;
      exec(cmd);
    }
  });

  // Release chokidar watchers (and other long-lived handles) on shutdown.
  // Without this, the registry's FSWatcher leaks file handles whenever the
  // CLI is restarted in-process (test harness, future hot-reload paths).
  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await registry.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[deloop] error closing component registry: ${message}`);
    }
  };

  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
  httpServer.on("close", () => {
    void shutdown();
  });
}

/**
 * Resolves the canvas-iframe style environment from the loaded config.
 *
 * Probes (in order):
 *   1. User-supplied `styles` from `.deloop/config.ts` — accepts either
 *      a single string or an array of strings. Each entry is resolved to
 *      an absolute path; per-entry existence is NOT pre-validated.
 *      Missing paths still get a `<link>` injected so the resulting 404
 *      becomes the user's signal. (Compare: when the user configured
 *      *nothing*, there's no link to 404 on, so we fall through to
 *      auto-detect and ultimately the warn-once path in
 *      {@link startServer}.)
 *   2. Conventional auto-detect paths (`src/styles/globals.css`, etc.) —
 *      only consulted when `styles` is undefined. Auto-detect stays
 *      single-only by design; opt into multiple entries via explicit
 *      config.
 *
 * `componentsDir` is resolved to an absolute path only when the user has
 * configured it; auto-detect does not touch this field.
 */
export function resolveCanvasStyleConfig(
  projectRoot: string,
  configuredStyles: string | string[] | undefined,
  configuredComponentsDir: string | undefined,
): CanvasStyleConfig {
  let cssPaths: string[] = [];
  if (configuredStyles !== undefined) {
    const entries = Array.isArray(configuredStyles) ? configuredStyles : [configuredStyles];
    cssPaths = entries.map((entry) => resolveUserPath(projectRoot, entry));
  } else {
    const detected = autoDetectStylesPath(projectRoot);
    if (detected != null) {
      cssPaths = [resolveUserPath(projectRoot, detected)];
    }
  }

  const componentsDir =
    configuredComponentsDir != null ? resolveUserPath(projectRoot, configuredComponentsDir) : null;

  return { cssPaths, componentsDir };
}

/**
 * Emits the "no CSS resolved" warning to stderr.
 *
 * Called once at dev-server startup when neither explicit `styles`
 * config nor auto-detect surfaced any CSS — components will render
 * against browser defaults, which is almost never what the user wants.
 * The message names a config field so the fix is one paste away.
 *
 * Exported so tests can invoke it directly without spinning a server.
 */
export function warnNoCssResolved(): void {
  process.stderr.write(
    "[deloop] No CSS entry found. Components will render without your design system. Set 'styles' in .deloop/config.ts (e.g. styles: 'src/styles/globals.css').\n",
  );
}

// Express response close + abort handlers — both needed because clients can
// either cleanly close (Connection: close) or abort mid-stream (browser tab
// closed). Either path must release the registry subscription so closed
// connections don't accumulate.
function _onSseClose(res: Response, cb: () => void): void {
  let called = false;
  const once = (): void => {
    if (called) return;
    called = true;
    cb();
  };
  res.on("close", once);
  res.on("error", once);
}

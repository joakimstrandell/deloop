import { createServer as createHttpServer } from "node:http";
import { exec } from "node:child_process";
import express from "express";
import { WebSocketServer } from "ws";
import { createViteComponentServer } from "./vite-component-server.js";
import { createComponentRegistry } from "./component-watcher.js";
import { loadDeloopConfig } from "./config-loader.js";
import { bootstrapDeloopDir } from "./bootstrap.js";

export interface ServerOptions {
  root: string;
  port: number;
  open: boolean;
}

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

  const vite = await createViteComponentServer(root);

  // REST API
  app.get("/api/components", async (_req, res) => {
    const components = await registry.list();
    res.json(components);
  });

  // Vite middleware handles all other requests (app, HMR, /@fs/ paths)
  app.use(vite.middlewares);

  // WebSocket server — reserved for future realtime features
  const wss = new WebSocketServer({ server: httpServer });
  wss.on("connection", (ws) => {
    console.log("[deloop] WebSocket client connected");
    ws.on("close", () => console.log("[deloop] WebSocket client disconnected"));
  });

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

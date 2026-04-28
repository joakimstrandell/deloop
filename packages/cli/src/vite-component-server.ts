import { createServer, type ViteDevServer } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Creates a Vite dev server configured to serve Deloop's browser app
 * while allowing the canvas iframe to dynamically import user components.
 *
 * The user project root is added to server.fs.allow, enabling the /@fs/
 * path prefix to serve and transform user component files (TSX → JS).
 *
 * React is deduplicated to prevent multiple-instance errors when user
 * components and Deloop's iframe both depend on React.
 *
 * Development note: appRoot is calculated relative to this file. When
 * the CLI is published to npm, this path must be updated to reference
 * bundled app assets. See ADR-0002 for context.
 */
export async function createViteComponentServer(projectRoot: string): Promise<ViteDevServer> {
  // In the workspace: packages/cli/src/ → ../../app = packages/app/
  const appRoot = join(__dirname, "../../app");

  const server = await createServer({
    // Explicitly load packages/app's vite.config.ts so the Tailwind v4 plugin
    // and all other app-level plugins are included. Without this, Vite searches
    // from process.cwd() (the user's project) and finds nothing.
    configFile: join(appRoot, "vite.config.ts"),
    root: appRoot,
    server: {
      middlewareMode: true,
      fs: {
        allow: [appRoot, projectRoot],
      },
    },
    resolve: {
      dedupe: ["react", "react-dom", "react/jsx-runtime"],
    },
    appType: "mpa",
    // Suppress Vite's own output; Deloop logs its own startup message
    logLevel: "warn",
  });

  return server;
}

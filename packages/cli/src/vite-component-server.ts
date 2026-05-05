import { createServer, type Plugin, type ViteDevServer } from "vite";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolution result for the user's canvas style environment.
 *
 * `cssPath` is the absolute path to the user's CSS entry file (or `null`
 * when nothing was found). `componentsDir` is the absolute components
 * directory used to inject an `@source` directive when the user's input
 * CSS does not declare one.
 */
export interface CanvasStyleConfig {
  cssPath: string | null;
  componentsDir: string | null;
}

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
 * `style` controls the canvas style environment (AWK-13). When `cssPath`
 * is set, a `<link rel="stylesheet" href="/@fs/<cssPath>">` is injected
 * into `iframe.html`'s `<head>` via `transformIndexHtml`. When
 * `componentsDir` is set, an `@source "<componentsDir>";` line is
 * prepended to the served CSS at transform time so Tailwind v4 picks up
 * those source files even if the user's CSS does not declare its own
 * `@source`.
 *
 * Development note: appRoot is calculated relative to this file. When
 * the CLI is published to npm, this path must be updated to reference
 * bundled app assets. See ADR-0002 for context.
 */
export async function createViteComponentServer(
  projectRoot: string,
  style: CanvasStyleConfig = { cssPath: null, componentsDir: null },
): Promise<ViteDevServer> {
  // In the workspace: packages/cli/src/ → ../../app = packages/app/
  const appRoot = join(__dirname, "../../app");

  const server = await createServer({
    // Explicitly load packages/app's vite.config.ts so the Tailwind v4 plugin
    // and all other app-level plugins are included. Without this, Vite searches
    // from process.cwd() (the user's project) and finds nothing.
    configFile: join(appRoot, "vite.config.ts"),
    root: appRoot,
    plugins: [canvasStyleEnvironmentPlugin(style)],
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

/**
 * Vite plugin that wires the user project's CSS into the canvas iframe.
 *
 * Two responsibilities:
 *
 * 1. `transformIndexHtml` for `iframe.html`: inject a `<link>` tag
 *    pointing at `/@fs/<absolute-css-path>`. Vite's normal CSS pipeline
 *    handles HMR for free, so saving the user's CSS triggers a hot
 *    update inside the iframe.
 *
 * 2. `transform` (with `enforce: "pre"`): when the user's input CSS does
 *    not declare its own `@source`, prepend an `@source
 *    "<absolute-componentsDir>";` line before Tailwind's plugin sees the
 *    file. This lets users opt into Tailwind class scanning without
 *    editing their CSS — a `componentsDir` field in `.deloop/config.ts`
 *    is enough.
 *
 * The plugin is a no-op when `cssPath` is null (no user CSS resolved).
 */
export function canvasStyleEnvironmentPlugin(style: CanvasStyleConfig): Plugin {
  const normalizedCssPath = style.cssPath != null ? normalize(style.cssPath) : null;
  const normalizedComponentsDir =
    style.componentsDir != null ? normalize(style.componentsDir) : null;

  return {
    name: "deloop:canvas-style-environment",
    // Run before `@tailwindcss/vite` so our prepended `@source` is visible
    // when Tailwind reads the file.
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // Only the canvas iframe entry receives the user CSS link. The
        // shell's index.html is intentionally untouched — shell styling
        // is owned by `packages/app` itself.
        if (!ctx.filename.endsWith("iframe.html")) return html;
        if (normalizedCssPath == null) return html;

        const href = `/@fs${normalizedCssPath}`;
        const linkTag = `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}" data-deloop-user-css>`;
        // Insert before `</head>` so the link lands inside <head>; if the
        // closing tag is missing for any reason, append at the end as a
        // best-effort fallback.
        if (html.includes("</head>")) {
          return html.replace("</head>", `${linkTag}</head>`);
        }
        return `${html}${linkTag}`;
      },
    },
    transform(code, id) {
      if (normalizedCssPath == null || normalizedComponentsDir == null) return null;
      // Vite passes IDs that may include query strings (e.g. `?used`,
      // `?direct`); compare against the bare path.
      const [bareId] = id.split("?");
      if (!bareId || normalize(bareId) !== normalizedCssPath) return null;
      // Skip if the user already declared an `@source` — respect their
      // choice.
      if (/@source\b/.test(code)) return null;
      const directive = `@source "${escapeCssString(normalizedComponentsDir)}";\n`;
      return { code: directive + code, map: null };
    },
  };
}

/**
 * Resolves a user-supplied path (from `.deloop/config.ts`) to an absolute
 * filesystem path under `projectRoot`. Already-absolute paths are
 * returned as-is so users can point at locations outside the project
 * tree if they really need to.
 */
export function resolveUserPath(projectRoot: string, userPath: string): string {
  return isAbsolute(userPath) ? normalize(userPath) : normalize(join(projectRoot, userPath));
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeCssString(value: string): string {
  // CSS string escapes: backslash and the surrounding quote. Filesystem
  // paths normally contain neither, but be defensive.
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

import { createServer, type Plugin, type ViteDevServer } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Resolution result for the user's canvas style environment.
 *
 * `cssPaths` is the ordered list of absolute paths to the user's CSS
 * entry files. Empty when nothing was found / configured. Multiple
 * entries are injected as separate `<link>` tags in array order (latest
 * wins on cascade tie). `componentsDir` is the absolute components
 * directory used to inject an `@source` directive when no entry already
 * declares one.
 */
export interface CanvasStyleConfig {
  cssPaths: string[];
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
 * `style` controls the canvas style environment (AWK-13). For each entry
 * in `cssPaths`, a `<link rel="stylesheet" href="/@fs/<path>">` is
 * injected into `iframe.html`'s `<head>` via `transformIndexHtml`, in
 * array order. When `componentsDir` is set, an `@source
 * "<componentsDir>";` line is prepended to the first entry that does not
 * already declare an `@source` (typically the user's design-system CSS),
 * so Tailwind v4 picks up those source files without manual config.
 * Subsequent entries are left untouched — they are usually plain
 * overrides.
 *
 * Development note: appRoot is calculated relative to this file. When
 * the CLI is published to npm, this path must be updated to reference
 * bundled app assets. See ADR-0002 for context.
 */
export async function createViteComponentServer(
  projectRoot: string,
  style: CanvasStyleConfig = { cssPaths: [], componentsDir: null },
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
 * 1. `transformIndexHtml` for `iframe.html`: inject one `<link>` tag per
 *    `cssPaths` entry, in array order, pointing at
 *    `/@fs/<absolute-css-path>`. Vite's normal CSS pipeline handles HMR
 *    for free, so saving the user's CSS triggers a hot update inside the
 *    iframe. Per-entry existence is not pre-validated — a missing path
 *    surfaces as a 404 in the browser, which is the explicit-but-wrong
 *    signal we want.
 *
 * 2. `transform` (with `enforce: "pre"`): when the user has configured a
 *    `componentsDir`, prepend `@source "<absolute-componentsDir>";` to
 *    the first `cssPaths` entry whose source does not already declare an
 *    `@source`. We pick that target at plugin-construction time by
 *    reading each entry off disk (synchronously, since we already block
 *    on existsSync elsewhere); subsequent entries are typically plain
 *    overrides and are left alone. If every entry already declares
 *    `@source`, no prepend happens.
 *
 * The plugin is a no-op when `cssPaths` is empty.
 */
export function canvasStyleEnvironmentPlugin(style: CanvasStyleConfig): Plugin {
  const normalizedCssPaths = style.cssPaths.map((p) => normalize(p));
  const normalizedComponentsDir =
    style.componentsDir != null ? normalize(style.componentsDir) : null;

  // Pick the prepend target at plugin-construction time: the first entry
  // whose on-disk content does not already declare `@source`. Missing
  // files are skipped for this purpose (the 404 will surface at runtime).
  // If `componentsDir` isn't configured, no entry is targeted.
  const prependTargetPath: string | null =
    normalizedComponentsDir != null ? pickPrependTarget(normalizedCssPaths) : null;

  return {
    name: "deloop:canvas-style-environment",
    // Run before `@tailwindcss/vite` so our prepended `@source` is visible
    // when Tailwind reads the file.
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(html, ctx) {
        // Only the canvas iframe entry receives the user CSS links. The
        // shell's index.html is intentionally untouched — shell styling
        // is owned by `packages/app` itself.
        if (!ctx.filename.endsWith("iframe.html")) return html;
        if (normalizedCssPaths.length === 0) return html;

        const linkTags = normalizedCssPaths
          .map((cssPath) => {
            const href = `/@fs${cssPath}`;
            return `<link rel="stylesheet" href="${escapeHtmlAttribute(href)}" data-deloop-user-css>`;
          })
          .join("");
        // Insert before `</head>` so the links land inside <head>; if the
        // closing tag is missing for any reason, append at the end as a
        // best-effort fallback.
        if (html.includes("</head>")) {
          return html.replace("</head>", `${linkTags}</head>`);
        }
        return `${html}${linkTags}`;
      },
    },
    transform(code, id) {
      if (prependTargetPath == null || normalizedComponentsDir == null) return null;
      // Vite passes IDs that may include query strings (e.g. `?used`,
      // `?direct`); compare against the bare path.
      const [bareId] = id.split("?");
      if (!bareId || normalize(bareId) !== prependTargetPath) return null;
      // Defensive: if the file *now* declares `@source` (e.g. user just
      // edited it), respect that and skip the prepend. The plugin will
      // need to be reloaded to re-pick the target.
      if (/@source\b/.test(code)) return null;
      const directive = `@source "${escapeCssString(normalizedComponentsDir)}";\n`;
      return { code: directive + code, map: null };
    },
  };
}

/**
 * Picks the first entry in `cssPaths` whose on-disk content does not
 * already declare an `@source` directive. Returns `null` if every
 * existing entry already has `@source`, or no entries exist on disk.
 *
 * Reads each file synchronously — this runs once at plugin construction
 * and the file count is small (typically 1–3 entries).
 */
function pickPrependTarget(cssPaths: readonly string[]): string | null {
  for (const cssPath of cssPaths) {
    if (!existsSync(cssPath)) continue;
    let contents: string;
    try {
      contents = readFileSync(cssPath, "utf8");
    } catch {
      continue;
    }
    if (!/@source\b/.test(contents)) return cssPath;
  }
  return null;
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

import { createServer, type Plugin, type ViteDevServer } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { parse as parseTsconfig } from "tsconfck";
import { existsSync, readFileSync } from "node:fs";
import type { Server as HttpServer } from "node:http";
import { dirname, isAbsolute, join, normalize, resolve as resolvePath } from "node:path";
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
 * Module-resolution config for the canvas Vite middleware (AWK-75).
 *
 * `userAliases` is the explicit `Record<aliasKey, target>` from
 * `.deloop/config.ts#resolve.alias`, with targets already resolved to
 * absolute paths. Registered as a Vite alias plugin BEFORE
 * `vite-tsconfig-paths`, so explicit overrides win on key collision.
 *
 * The tsconfig-derived aliases are auto-detected at server-construction
 * time by passing `tsconfig.json` and `tsconfig.app.json` (when they
 * exist) to `vite-tsconfig-paths` as explicit `projects`. Explicit
 * `projects` is REQUIRED because Vite's `root` is `packages/app` (Deloop's
 * own canvas shell), not the user project root — without it the plugin
 * silently resolves user aliases against Deloop's tsconfig.
 */
export interface CanvasResolveConfig {
  userAliases: Record<string, string>;
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
/**
 * Optional integration hooks for {@link createViteComponentServer}.
 *
 * `httpServer` lets the caller hand Vite a pre-existing Node HTTP server
 * to which it should attach the HMR WebSocket upgrade. When omitted,
 * Vite spawns its own WebSocket server on port 24678. Sharing a server
 * is required when running multiple CLI instances side-by-side (e.g.
 * parallel Playwright webServers) — otherwise the second instance
 * collides on 24678 and HMR clients reconnect-loop endlessly.
 */
export interface CanvasServerHooks {
  httpServer?: HttpServer;
}

export async function createViteComponentServer(
  projectRoot: string,
  style: CanvasStyleConfig = { cssPaths: [], componentsDir: null },
  resolveConfig: CanvasResolveConfig = { userAliases: {} },
  hooks: CanvasServerHooks = {},
): Promise<ViteDevServer> {
  // In the workspace: packages/cli/src/ → ../../app = packages/app/
  const appRoot = join(__dirname, "../../app");

  // AWK-75: discover the user's tsconfig path-alias declarations so we can
  // serve `@/foo` style imports through Vite's middleware. Explicit
  // `projects` is required because Vite's `root` is `appRoot`, not the
  // user project root — without it the plugin would silently resolve
  // aliases against Deloop's own tsconfig. See vite-tsconfig-paths docs.
  const candidateTsconfigs = [
    join(projectRoot, "tsconfig.json"),
    join(projectRoot, "tsconfig.app.json"),
  ].filter((p) => existsSync(p));

  // Eagerly resolve every active alias target so we can pre-expand
  // `server.fs.allow`. Vite's `/@fs/` middleware checks the allow list
  // at request time; if the user's alias points outside `projectRoot`
  // (common in monorepos), we must whitelist that directory now or
  // requests will 403. Errors here are non-fatal: a malformed tsconfig
  // must NOT crash the dev server.
  const tsconfigAliasTargets = await collectTsconfigAliasTargets(candidateTsconfigs);
  const userAliasTargets = Object.values(resolveConfig.userAliases).map((target) =>
    resolveAliasTarget(projectRoot, target),
  );
  const fsAllow = uniquePaths([appRoot, projectRoot, ...tsconfigAliasTargets, ...userAliasTargets]);

  // User-supplied aliases first (highest precedence) — Vite resolves
  // plugins in registration order, so an entry registered earlier wins on
  // key collision against `vite-tsconfig-paths`.
  const userAliasPlugin = createUserAliasPlugin(projectRoot, resolveConfig.userAliases);

  // Wrap plugin registration in try/catch as belt-and-suspenders: the
  // plugin's `loose: true` flag covers most parse-tolerance, but any
  // unexpected throw during construction must NOT crash the dev server.
  //
  // Why `vite-tsconfig-paths` instead of Vite 8's native
  // `resolve.tsconfigPaths: true`? The native option does not accept an
  // explicit `projects: [...]` argument and resolves against Vite's
  // `root` (here `appRoot`, i.e. `packages/app` — Deloop's canvas shell,
  // not the user project). It would silently resolve user `@/foo`
  // imports against Deloop's own tsconfig. Until the native option grows
  // an explicit-projects knob, we keep the (deprecated) plugin so we can
  // pass `projects: candidateTsconfigs` and target the user project.
  let tsconfigPathsPlugin: Plugin | Plugin[] | null = null;
  if (candidateTsconfigs.length > 0) {
    try {
      tsconfigPathsPlugin = tsconfigPaths({
        projects: candidateTsconfigs,
        loose: true,
        // Defer parse-error reporting to our own one-line warning emitted
        // from `collectTsconfigAliasTargets`; the plugin's stack trace is
        // noisy and duplicates info the user already has.
        ignoreConfigErrors: true,
      }) as Plugin | Plugin[];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[deloop] failed to register tsconfig path-alias resolver: ${message}\n`,
      );
      tsconfigPathsPlugin = null;
    }
  }

  const server = await createServer({
    // Explicitly load packages/app's vite.config.ts so the Tailwind v4 plugin
    // and all other app-level plugins are included. Without this, Vite searches
    // from process.cwd() (the user's project) and finds nothing.
    configFile: join(appRoot, "vite.config.ts"),
    root: appRoot,
    plugins: [
      ...(userAliasPlugin ? [userAliasPlugin] : []),
      ...(tsconfigPathsPlugin ? [tsconfigPathsPlugin].flat() : []),
      canvasStyleEnvironmentPlugin(style),
    ],
    server: {
      middlewareMode: true,
      fs: {
        allow: fsAllow,
      },
      // When the caller supplies an HTTP server, attach HMR's WebSocket
      // upgrade to it instead of spawning a separate WS server on port
      // 24678. Required for parallel CLI instances; harmless otherwise.
      ...(hooks.httpServer ? { hmr: { server: hooks.httpServer } } : {}),
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
 * Reads the list of candidate user tsconfig files and returns the set of
 * absolute directory targets that any `compilerOptions.paths` mapping
 * resolves to. The result is used to expand `server.fs.allow` so Vite's
 * `/@fs/` middleware does not 403 on monorepo-sibling aliases.
 *
 * `tsconfck.parse` follows `extends` chains (relative + package-style
 * like `@tsconfig/recommended`) and merges `compilerOptions.paths` from
 * the entire chain — that's what makes step (3) of the AC true without
 * any special-casing on our side.
 *
 * Defensive posture: any failure (missing file, parse error, malformed
 * `paths` shape) collapses to "no aliases from this tsconfig" with a
 * single stderr warning. We never throw.
 */
export async function collectTsconfigAliasTargets(
  tsconfigPaths: readonly string[],
): Promise<string[]> {
  const targets: string[] = [];
  for (const tsconfigPath of tsconfigPaths) {
    try {
      const result = await parseTsconfig(tsconfigPath);
      const merged = result.tsconfig as
        | { compilerOptions?: { baseUrl?: string; paths?: Record<string, unknown> } }
        | undefined;
      const compilerOptions = merged?.compilerOptions;
      if (compilerOptions?.paths == null) continue;

      // `baseUrl` defaults to the directory of the tsconfig that DEFINED
      // the `paths` (TypeScript's resolution rule). When `extends` is
      // involved, tsconfck merges `paths` and resolves `baseUrl` against
      // the file that introduced it; we mirror that by preferring the
      // merged baseUrl if present and falling back to the tsconfig's own
      // directory.
      const baseDir =
        typeof compilerOptions.baseUrl === "string"
          ? resolvePath(dirname(tsconfigPath), compilerOptions.baseUrl)
          : dirname(tsconfigPath);

      for (const candidates of Object.values(compilerOptions.paths)) {
        if (!Array.isArray(candidates)) continue;
        for (const candidate of candidates) {
          if (typeof candidate !== "string") continue;
          // Strip trailing wildcard segments (`./src/*` → `./src`).
          const stripped = candidate.replace(/\/?\*+$/, "").replace(/\/+$/, "");
          if (stripped === "") continue;
          const absolute = resolvePath(baseDir, stripped);
          targets.push(absolute);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[deloop] failed to read ${tsconfigPath}: ${message}\n`);
    }
  }
  return targets;
}

/**
 * Builds a Vite plugin that registers user-supplied aliases (from
 * `.deloop/config.ts#resolve.alias`) ahead of `vite-tsconfig-paths`,
 * giving them precedence on key collision.
 *
 * Returns `null` when there are no aliases to register, so the caller
 * can omit the plugin entirely.
 */
export function createUserAliasPlugin(
  projectRoot: string,
  aliases: Record<string, string>,
): Plugin | null {
  const entries = Object.entries(aliases);
  if (entries.length === 0) return null;

  const resolved: { find: string; replacement: string }[] = entries.map(([find, target]) => ({
    find,
    replacement: resolveAliasTarget(projectRoot, target),
  }));

  return {
    name: "deloop:user-aliases",
    enforce: "pre",
    config() {
      return {
        resolve: {
          alias: resolved,
        },
      };
    },
  };
}

/**
 * Resolves a user-configured alias target to an absolute path. Already-
 * absolute paths are returned normalized; relative paths are resolved
 * against `projectRoot`.
 */
function resolveAliasTarget(projectRoot: string, target: string): string {
  return isAbsolute(target) ? normalize(target) : resolvePath(projectRoot, target);
}

/**
 * Deduplicates a list of paths, preserving first-seen order. Uses
 * normalized form for comparison so trailing-slash drift between
 * sources doesn't produce duplicate entries.
 */
function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of paths) {
    const normalized = normalize(p);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
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

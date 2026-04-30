import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import { basename, dirname, relative } from "node:path";

export interface ComponentInfo {
  /** Display name derived from the filename (e.g. "Button") */
  name: string;
  /** Absolute filesystem path to the component file */
  path: string;
  /** Path relative to the project root (for display) */
  relativePath: string;
}

export interface DiscoverComponentsOptions {
  /**
   * Component sources, expressed as either directory paths or explicit globs.
   * Directory paths are expanded to `<dir>/**\/*.tsx`. When omitted, the
   * default `src/components` is used.
   */
  components?: string[];
}

const DEFAULT_COMPONENT_SOURCES = ["src/components"];
const TEST_AND_STORY_IGNORES = [
  "**/*.test.tsx",
  "**/*.spec.tsx",
  "**/*.stories.tsx",
  "**/*.story.tsx",
  "**/*.test.ts",
  "**/*.spec.ts",
  "**/*.stories.ts",
  "**/*.story.ts",
];

const GLOB_CHARS = /[*?{}[\]()!]/;

function looksLikeGlob(pattern: string): boolean {
  return GLOB_CHARS.test(pattern);
}

function expandSource(pattern: string): string {
  return looksLikeGlob(pattern) ? pattern : `${pattern.replace(/\/$/, "")}/**/*.tsx`;
}

/**
 * Heuristic barrel-file detection.
 *
 * A file is considered a barrel/re-export when every non-empty, non-comment
 * statement is a re-export (e.g. `export * from "./X"` or
 * `export { Y } from "./X"`). We use a regex pass rather than a full AST
 * because barrels are syntactically simple and the cost of an AST parser
 * across every component file is not justified by the marginal accuracy
 * gain. Trade-off documented for future revisit if false positives appear.
 */
function isBarrelFile(source: string): boolean {
  const stripped = source
    // strip block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // strip line comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .trim();

  if (stripped.length === 0) return false;

  const statements = stripped
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length === 0) return false;

  const reExportPattern = /^export\s+(?:\*|\{[^}]*\}|type\s+\{[^}]*\})\s+from\s+["'][^"']+["']$/;

  return statements.every((s) => reExportPattern.test(s));
}

/**
 * Resolves the display name for a component file.
 *
 * For `Button/index.tsx`, returns `Button` (parent directory). This covers
 * a common convention where each component lives in its own folder with an
 * `index.tsx` entry. The `forwardRef` wrapper case is also handled here:
 * since the registry name is derived from the filename, the wrapper does
 * not need any special-case logic in discovery.
 */
function deriveName(filePath: string): string {
  const ext = filePath.endsWith(".tsx") ? ".tsx" : filePath.endsWith(".ts") ? ".ts" : "";
  const base = basename(filePath, ext);
  if (base === "index") {
    return basename(dirname(filePath));
  }
  return base;
}

/**
 * Discovers React components in the project.
 *
 * Default behavior scans `src/components/**\/*.tsx`, excluding test, spec,
 * and story files. The `components` option overrides the source list with
 * directory paths or explicit globs.
 *
 * Barrel files (re-export only) are filtered out so they don't appear as
 * components themselves; the underlying targets are discovered directly.
 */
export async function discoverComponents(
  projectRoot: string,
  options: DiscoverComponentsOptions = {},
): Promise<ComponentInfo[]> {
  const sources = options.components ?? DEFAULT_COMPONENT_SOURCES;
  if (sources.length === 0) return [];

  const patterns = sources.map(expandSource);

  const files = await fg(patterns, {
    cwd: projectRoot,
    absolute: true,
    ignore: TEST_AND_STORY_IGNORES,
    unique: true,
  });

  const results = await Promise.all(
    files.map(async (filePath) => {
      const source = await readFile(filePath, "utf8").catch(() => "");
      if (isBarrelFile(source)) return null;
      const info: ComponentInfo = {
        name: deriveName(filePath),
        path: filePath,
        relativePath: relative(projectRoot, filePath),
      };
      return info;
    }),
  );

  return results
    .filter((r): r is ComponentInfo => r !== null)
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

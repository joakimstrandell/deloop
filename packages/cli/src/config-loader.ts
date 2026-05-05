import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

/**
 * The shape exported by `.deloop/config.ts`.
 *
 * Kept intentionally narrow: only fields recognized today are retained;
 * unknown fields are silently dropped by `normalizeConfig`. New fields
 * should be added here and validated below so unknown values surface
 * clearly.
 */
export interface DeloopConfig {
  /**
   * Component sources for discovery. Each entry is either a directory path
   * (e.g. `"src/widgets"`) or an explicit glob (e.g. `"src/**\/*.tsx"`).
   */
  components?: string[];
  /**
   * Single CSS entry for the canvas iframe, relative to the user project
   * root (e.g. `"src/styles/globals.css"`). Loaded as the user's design
   * environment so components render with their real tokens, fonts, and
   * Tailwind utilities. When absent, Deloop probes a small set of known
   * conventional paths via {@link autoDetectStylesPath}.
   */
  styles?: string;
  /**
   * Directory of component sources to scan for Tailwind class usage when
   * the user's input CSS does not already declare an `@source` directive.
   * Relative to the user project root. Injected as
   * `@source "<absolute-componentsDir>";` prepended to the served CSS so
   * Tailwind v4 generates utilities for those files even without a user
   * `@source`.
   */
  componentsDir?: string;
}

/**
 * Conventional CSS entry paths probed in order when the user has no
 * `styles` field. The first existing path wins. If none match, no CSS is
 * loaded — there is no warning, by design.
 */
const STYLES_AUTO_DETECT_PATHS = [
  "src/styles/globals.css",
  "src/styles/index.css",
  "src/globals.css",
  "src/index.css",
  "src/styles.css",
] as const;

/**
 * Loads the user's `.deloop/config.ts`.
 *
 * Returns:
 *   - the default-exported config object on success,
 *   - `null` when the file does not exist or when loading fails.
 *
 * Uses `tsx`'s `tsImport` to evaluate the TypeScript module without
 * requiring a precompile step. We picked `tsImport` over `jiti` because
 * `tsx` was already a workspace dev dep, so promoting it to a runtime dep
 * keeps the install footprint minimal.
 *
 * `tsImport` returns a CJS-style namespace where the user's default export
 * lives at `mod.default.default`. We unwrap that here so callers receive a
 * plain config object.
 *
 * Errors during import (syntax errors, runtime throws at module top level,
 * etc.) are caught and reported to stderr; the CLI then falls back to the
 * "no config" path so a malformed user config never crashes the dev server.
 */
export async function loadDeloopConfig(projectRoot: string): Promise<DeloopConfig | null> {
  const configPath = join(projectRoot, ".deloop/config.ts");
  if (!existsSync(configPath)) return null;

  const url = pathToFileURL(configPath).href;

  let mod: Record<string, unknown>;
  try {
    mod = (await tsImport(url, import.meta.url)) as Record<string, unknown>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[deloop] failed to load .deloop/config.ts: ${message}\n[deloop] falling back to default component discovery.`,
    );
    return null;
  }

  const exported = unwrapDefault(mod);
  if (exported == null || typeof exported !== "object") {
    return {};
  }

  return normalizeConfig(exported as Record<string, unknown>);
}

/**
 * Probes for a conventional CSS entry under `projectRoot` when the user
 * has not configured `styles` explicitly. Returns the first existing path
 * in {@link STYLES_AUTO_DETECT_PATHS} as a project-relative string, or
 * `null` if none match (in which case the canvas loads no user CSS).
 */
export function autoDetectStylesPath(projectRoot: string): string | null {
  for (const candidate of STYLES_AUTO_DETECT_PATHS) {
    if (existsSync(join(projectRoot, candidate))) {
      return candidate;
    }
  }
  return null;
}

function unwrapDefault(mod: Record<string, unknown>): unknown {
  // tsImport surfaces both `default` and a CJS interop layer; the user's
  // `export default {...}` sits at `mod.default.default`. Walk one level
  // and fall back to `mod.default` for non-interop loaders.
  const top = mod["default"];
  if (top && typeof top === "object" && "default" in (top as Record<string, unknown>)) {
    return (top as Record<string, unknown>)["default"];
  }
  return top;
}

function normalizeConfig(raw: Record<string, unknown>): DeloopConfig {
  const result: DeloopConfig = {};
  if (Array.isArray(raw["components"])) {
    const filtered = (raw["components"] as unknown[]).filter(
      (entry): entry is string => typeof entry === "string",
    );
    result.components = filtered;
  }
  if (typeof raw["styles"] === "string") {
    result.styles = raw["styles"];
  }
  if (typeof raw["componentsDir"] === "string") {
    result.componentsDir = raw["componentsDir"];
  }
  return result;
}

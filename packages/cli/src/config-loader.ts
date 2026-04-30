import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

/**
 * The shape exported by `.deloop/config.ts`.
 *
 * Kept intentionally narrow: only the `components` field is recognized
 * today. Future fields should be added here and validated in
 * `loadDeloopConfig` so unknown values surface clearly.
 */
export interface DeloopConfig {
  /**
   * Component sources for discovery. Each entry is either a directory path
   * (e.g. `"src/widgets"`) or an explicit glob (e.g. `"src/**\/*.tsx"`).
   */
  components?: string[];
}

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
  return result;
}

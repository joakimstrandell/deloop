import fg from "fast-glob";
import { readFile } from "node:fs/promises";
import { basename, dirname, relative } from "node:path";
import ts from "typescript";

export interface ComponentInfo {
  /** Display name — the verbatim identifier of a shim's named export. */
  name: string;
  /** Absolute filesystem path to the shim file. */
  path: string;
  /** Path relative to the project root (for display). */
  relativePath: string;
}

export interface DiscoverComponentsOptions {
  /**
   * Component sources, expressed as either directory paths or explicit globs.
   *
   * Directory paths are expanded to `<dir>/**\/*.deloop.tsx` — strict
   * shim-only discovery (see ADR-0005). Explicit globs (anything containing
   * a glob meta-character) are passed through verbatim, which lets advanced
   * users opt back into bare-file scanning if they really need it.
   *
   * When omitted, the default `src/components` is used.
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
  // Strict shim-only default (ADR-0005): a bare directory path expands to a
  // glob that matches only `*.deloop.tsx` shim files. Explicit globs are
  // passed through unchanged so advanced users who want to scan bare `.tsx`
  // can opt in by writing the pattern themselves.
  return looksLikeGlob(pattern) ? pattern : `${pattern.replace(/\/$/, "")}/**/*.deloop.tsx`;
}

/**
 * Heuristic barrel-file detection.
 *
 * Retained for the explicit-glob bare-file scanning path: a user who opts
 * back into `src/widgets/**\/*.tsx` still wants `index.tsx` re-export files
 * filtered out. Shim-only discovery (`*.deloop.tsx`) doesn't need it because
 * the discovery unit is a named export, not a file.
 *
 * A file is considered a barrel/re-export when every non-empty, non-comment
 * statement is a re-export. Recognized forms:
 *   - `export * from "./X"`
 *   - `export * as ns from "./X"`
 *   - `export { A, B } from "./X"` (single- or multi-line)
 *   - `export type { A, B } from "./X"` (single- or multi-line)
 */
function isBarrelFile(source: string): boolean {
  const stripped = source
    // strip block comments
    .replace(/\/\*[\s\S]*?\*\//g, "")
    // strip line comments
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .trim();

  if (stripped.length === 0) return false;

  // Flatten newlines inside `{...}` so multi-line named re-exports survive
  // the statement split below. We don't need a real parser here because
  // braces in re-export specifiers don't nest.
  const flattened = stripped.replace(
    /\{([^{}]*)\}/g,
    (_, inner: string) => `{${inner.replace(/\s+/g, " ").trim()}}`,
  );

  const statements = flattened
    .split(/;|\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (statements.length === 0) return false;

  const reExportPattern =
    /^export\s+(?:\*(?:\s+as\s+\w+)?|type\s*\{[^}]*\}|\{[^}]*\})\s+from\s+["'][^"']+["']$/;

  return statements.every((s) => reExportPattern.test(s));
}

/**
 * Resolves the display name for a bare component file (explicit-glob path).
 *
 * For `Button/index.tsx`, returns `Button` (parent directory). The
 * `forwardRef` wrapper case is also covered because the registry name is
 * derived from the filename.
 */
function deriveBareName(filePath: string): string {
  const ext = filePath.endsWith(".tsx") ? ".tsx" : filePath.endsWith(".ts") ? ".ts" : "";
  const base = basename(filePath, ext);
  if (base === "index") {
    return basename(dirname(filePath));
  }
  return base;
}

/**
 * Extracts the verbatim identifiers of a shim file's named exports.
 *
 * Implementation note: parses the shim with the TypeScript compiler API
 * (already a workspace devDep). A regex pass would be brittle around
 * `export { X as Y }` and re-exports; the TS parser handles both cleanly
 * with no extra dependency cost.
 *
 * Recognized forms (each contributes the *exported* identifier):
 *   - `export function X() {}` / `export class X {}`
 *   - `export const X = ...` (also `let` / `var` — multiple declarators)
 *   - `export { X }` (after a local declaration)
 *   - `export { X as Y }` — yields `Y`
 *   - `export { X } from "./other"` — yields `X`
 *   - `export { X as Y } from "./other"` — yields `Y`
 *
 * Explicitly NOT supported:
 *   - `export default ...` — ignored (no named entry produced).
 *   - `export * from "./other"` — ignored. Following star re-exports requires
 *     resolving the target file; we deliberately don't go there. Authors
 *     who want re-export-all can use named re-exports instead.
 *
 * Defensive de-duplication: if a malformed shim declares the same exported
 * name twice, we surface it once. Last-wins semantics are irrelevant —
 * the Set guarantees a single entry per identifier.
 */
function listNamedExports(filePath: string, source: string): string[] {
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    /*setParentNodes*/ false,
    ts.ScriptKind.TSX,
  );
  const seen = new Set<string>();

  const hasModifier = (node: ts.Node, kind: ts.SyntaxKind): boolean => {
    const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    return modifiers?.some((m) => m.kind === kind) ?? false;
  };

  for (const stmt of sf.statements) {
    // `export function X() {}` / `export class X {}` (skip default-modified)
    if (
      (ts.isFunctionDeclaration(stmt) || ts.isClassDeclaration(stmt)) &&
      hasModifier(stmt, ts.SyntaxKind.ExportKeyword) &&
      !hasModifier(stmt, ts.SyntaxKind.DefaultKeyword) &&
      stmt.name
    ) {
      seen.add(stmt.name.text);
      continue;
    }

    // `export const X = ...` (and `let` / `var`, multiple declarators)
    if (ts.isVariableStatement(stmt) && hasModifier(stmt, ts.SyntaxKind.ExportKeyword)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          seen.add(decl.name.text);
        }
      }
      continue;
    }

    // `export { A, B as C }` and `export { A } from "./x"` — el.name is the
    // *exported* name (right-hand side of `as`).
    //
    // Type-only exports are filtered out: `export type { A, B }` disappears
    // at runtime, so surfacing them as sidebar entries would produce
    // unrenderable components. Both the whole-declaration form
    // (`stmt.isTypeOnly`) and the per-specifier form (`el.isTypeOnly` for
    // `export { type A, B }`) are skipped.
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      if (stmt.isTypeOnly) continue;
      for (const el of stmt.exportClause.elements) {
        if (el.isTypeOnly) continue;
        seen.add(el.name.text);
      }
      continue;
    }

    // `export * from "./x"` and `export * as ns from "./x"` — intentionally
    // skipped (see function doc).
  }

  return Array.from(seen);
}

/**
 * Discovers React components in the project under strict shim-only rules
 * (ADR-0005).
 *
 * Default behavior scans `src/components/**\/*.deloop.tsx`. Each named
 * export of a discovered shim becomes one Component entry whose `name` is
 * the verbatim export identifier and whose `path` is the shim file's
 * absolute path. Default exports are ignored. Empty shims (no named
 * exports) yield zero entries with no error.
 *
 * Explicit-glob source entries (anything with glob meta-characters) are
 * passed through unchanged. When such a glob matches non-shim `.tsx`
 * files, those files fall through the legacy bare-file path: barrel files
 * are filtered out and one entry per file is produced under the filename.
 * This is the documented opt-out for users who want bare scanning.
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
    files.map(async (filePath): Promise<ComponentInfo[]> => {
      const source = await readFile(filePath, "utf8").catch(() => "");
      if (filePath.endsWith(".deloop.tsx")) {
        // Shim path: each named export becomes one Component entry.
        const exports = listNamedExports(filePath, source);
        const relativePath = relative(projectRoot, filePath);
        return exports.map((name) => ({
          name,
          path: filePath,
          relativePath,
        }));
      }

      // Bare-file path (only reachable via explicit globs). Honor the
      // existing barrel-file filter so re-export-only `index.tsx` doesn't
      // pollute the sidebar.
      if (isBarrelFile(source)) return [];
      return [
        {
          name: deriveBareName(filePath),
          path: filePath,
          relativePath: relative(projectRoot, filePath),
        },
      ];
    }),
  );

  return results.flat().sort((a, b) => {
    // (relativePath, name) ascending. Tie-breaker on `name` matters now
    // that one file can contribute multiple entries.
    const byPath = a.relativePath.localeCompare(b.relativePath);
    if (byPath !== 0) return byPath;
    return a.name.localeCompare(b.name);
  });
}

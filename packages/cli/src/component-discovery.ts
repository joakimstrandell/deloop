import fg from "fast-glob";
import { basename, relative } from "node:path";

export interface ComponentInfo {
  /** Display name derived from the filename (e.g. "Button") */
  name: string;
  /** Absolute filesystem path to the component file */
  path: string;
  /** Path relative to the project root (for display) */
  relativePath: string;
}

/**
 * Discovers React components in the project.
 *
 * Scans src/components/**\/*.tsx by default. A file is included if it
 * matches the glob pattern and is not a test, spec, or story file.
 *
 * This function is pure (no side effects beyond filesystem reads) and
 * is covered by unit tests in src/component-discovery.test.ts.
 */
export async function discoverComponents(projectRoot: string): Promise<ComponentInfo[]> {
  const files = await fg("src/components/**/*.tsx", {
    cwd: projectRoot,
    absolute: true,
    ignore: ["**/*.test.tsx", "**/*.spec.tsx", "**/*.stories.tsx", "**/*.story.tsx"],
  });

  return files.map((filePath) => ({
    name: basename(filePath, ".tsx"),
    path: filePath,
    relativePath: relative(projectRoot, filePath),
  }));
}

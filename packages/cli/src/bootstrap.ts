import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const DEFAULT_CONFIG = `// Deloop configuration. Add fields here to customize component discovery, styles, and more.
export default {};
`;

const DEFAULT_CANVAS = "{}\n";

/**
 * Ensures the project's .deloop/ directory exists with default config and
 * canvas state files. Idempotent — existing files are never overwritten.
 */
export async function bootstrapDeloopDir(projectRoot: string): Promise<void> {
  const deloopDir = join(projectRoot, ".deloop");
  await mkdir(deloopDir, { recursive: true });

  const configPath = join(deloopDir, "config.ts");
  if (!existsSync(configPath)) {
    await writeFile(configPath, DEFAULT_CONFIG, "utf8");
  }

  const canvasPath = join(deloopDir, "canvas.json");
  if (!existsSync(canvasPath)) {
    await writeFile(canvasPath, DEFAULT_CANVAS, "utf8");
  }
}

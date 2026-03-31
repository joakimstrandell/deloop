#!/usr/bin/env node
/**
 * CLI entry point wrapper.
 *
 * Finds the tsx binary relative to this package and uses it to run
 * the TypeScript source directly. Works in both workspace development
 * and when published to npm (where tsx is a peer/bundled dep).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const dir = dirname(fileURLToPath(import.meta.url));
const entry = join(dir, "..", "src", "index.ts");

// Resolve tsx relative to this package
const req = createRequire(import.meta.url);
const tsxPkg = req.resolve("tsx/package.json");
const tsxCli = join(dirname(tsxPkg), "dist", "cli.mjs");

const result = spawnSync(process.execPath, [tsxCli, entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: process.cwd(),
});

process.exit(result.status ?? 0);

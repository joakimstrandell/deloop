import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["html"], ["line"]],
  use: {
    baseURL: "http://localhost:4242",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    // Run Deloop CLI pointed at packages/ui (Deloop dogfoods its own design
    // system) from the repo root. tsx runs TypeScript directly in development.
    command:
      "node node_modules/tsx/dist/cli.mjs packages/cli/src/index.ts --root packages/ui --port 4242 --no-open",
    cwd: repoRoot,
    url: "http://localhost:4242",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});

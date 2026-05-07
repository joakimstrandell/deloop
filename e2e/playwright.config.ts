import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Two parallel Deloop instances run for E2E:
 *
 *   - `chromium` project (port 4242): the dogfood server pointed at
 *     `packages/ui`. Used by the broad component-render / shell /
 *     bootstrap / sidebar specs.
 *   - `chromium-tsconfig-app-split` project (port 4243): a fixture
 *     project under `e2e/fixtures/tsconfig-app-split/` whose path aliases
 *     live in `tsconfig.app.json` (with a stub `tsconfig.json`
 *     `references`-ing it). Verifies AWK-75 honors the split tsconfig
 *     layout.
 *
 * Each project filters by spec file via `testMatch` so the two webServers
 * stay independent; that also means the two run sequentially under
 * `fullyParallel: false`, which is fine — total runtime stays bounded.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // The two webServers below share dev-server resources (file watchers,
  // SSE channels) and tests can interfere with each other when run in
  // parallel browser contexts. Serialize at the worker level too so the
  // suite runs deterministically locally and in CI.
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["html"], ["line"]],
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4242" },
      testIgnore: ["**/tsconfig-paths-*.spec.ts"],
    },
    {
      name: "chromium-tsconfig-app-split",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4243" },
      testMatch: ["**/tsconfig-paths-*.spec.ts"],
    },
  ],
  webServer: [
    {
      // Run Deloop CLI pointed at packages/ui (Deloop dogfoods its own design
      // system) from the repo root. tsx runs TypeScript directly in development.
      command:
        "node node_modules/tsx/dist/cli.mjs packages/cli/src/index.ts --root packages/ui --port 4242 --no-open",
      cwd: repoRoot,
      url: "http://localhost:4242",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
    {
      // AWK-75: a parallel Deloop instance pointed at the tsconfig-app-split
      // fixture. Boots on a separate port so the dogfood server can keep
      // running.
      command:
        "node node_modules/tsx/dist/cli.mjs packages/cli/src/index.ts --root e2e/fixtures/tsconfig-app-split --port 4243 --no-open",
      cwd: repoRoot,
      url: "http://localhost:4243",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
  ],
});

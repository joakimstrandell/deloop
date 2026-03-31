import { defineConfig, devices } from "@playwright/test";

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
    // Run Deloop CLI pointed at the sample-app from the repo root.
    // tsx is used to run TypeScript directly in development.
    command:
      "node node_modules/tsx/dist/cli.mjs packages/cli/src/index.ts --root packages/sample-app --port 4242 --no-open",
    url: "http://localhost:4242",
    reuseExistingServer: !process.env["CI"],
    timeout: 30_000,
  },
});

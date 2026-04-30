/**
 * E2E coverage for the .deloop/ bootstrap workflow (AWK-9).
 *
 * The Playwright webServer (see playwright.config.ts) starts the Deloop CLI
 * pointed at packages/sample-app. After the server is up, the CLI's bootstrap
 * step must have created .deloop/config.ts and .deloop/canvas.json there.
 *
 * Idempotency / no-overwrite behavior is covered by unit tests in
 * packages/cli/src/bootstrap.test.ts; this spec verifies the artifacts are
 * actually produced when the CLI runs end-to-end.
 */
import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const deloopDir = resolve(repoRoot, "packages/sample-app/.deloop");

test.describe("CLI bootstrap", () => {
  test("scaffolds .deloop/config.ts with a default export", async ({ page }) => {
    await page.goto("/");

    const config = readFileSync(resolve(deloopDir, "config.ts"), "utf8");
    expect(config).toContain("export default");
  });

  test("scaffolds .deloop/canvas.json with valid JSON", async ({ page }) => {
    await page.goto("/");

    const canvas = readFileSync(resolve(deloopDir, "canvas.json"), "utf8");
    expect(() => JSON.parse(canvas)).not.toThrow();
  });
});

/**
 * AWK-75: Deloop's Vite middleware honors path aliases declared in
 * `tsconfig.app.json` (the typical Vite/shadcn split: a stub
 * `tsconfig.json` that `references`-es `tsconfig.app.json`, where the
 * actual `compilerOptions.paths` live).
 *
 * The fixture under `e2e/fixtures/tsconfig-app-split/` declares a single
 * shim component whose source imports `@/lib/utils`. If the alias does
 * NOT resolve, the iframe import fails and the component never mounts.
 * The mount-success assertion below is the regression signal.
 *
 * This spec is targeted at the parallel webServer on port 4243 via the
 * `chromium-tsconfig-app-split` Playwright project — see
 * `playwright.config.ts`. Spec files matching `tsconfig-paths-*.spec.ts`
 * run only against that project.
 */
import { test, expect } from "@playwright/test";

test.describe("tsconfig.app.json path-alias propagation", () => {
  test("a component importing @/lib/utils mounts in the canvas", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto("/");

    // The fixture's shim discovery surfaces an `Example` entry in the
    // sidebar; clicking it must mount the component without source edits.
    await expect(page.getByRole("button", { name: "Example", exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Example", exact: true }).click();

    const canvas = page.frameLocator("iframe#canvas");
    // The component renders text `Example: alias-resolved` — proving the
    // aliased import was resolved by Deloop's middleware.
    await expect(canvas.getByText(/Example: alias-resolved/)).toBeVisible({
      timeout: 10_000,
    });

    // No JS errors during the alias-resolved mount.
    expect(consoleErrors).toEqual([]);
  });
});

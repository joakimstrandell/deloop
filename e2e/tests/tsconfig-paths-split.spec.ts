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
import { test, expect, type Page } from "@playwright/test";
import { dropComponentOnCanvas } from "./helpers/canvas-drop.js";

async function getIframeNavigationCount(page: Page): Promise<number> {
  const frame = page.frame({ url: /iframe\.html/ });
  if (!frame) throw new Error("Canvas iframe not loaded");
  return frame.evaluate(() => performance.getEntriesByType("navigation").length);
}

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

    // Wait for the canvas iframe to be ready before dispatching the
    // synthetic drop — matches the AWK-14 test pattern.
    await expect(page.getByText("Canvas ready")).toBeVisible({ timeout: 10_000 });

    // The fixture's shim discovery surfaces an `Example` entry in the
    // sidebar; dragging it onto the canvas must mount the component
    // without source edits. (Click-to-mount was removed in AWK-14;
    // drag-and-drop is the only mount affordance now.)
    await expect(page.getByRole("button", { name: "Example", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // AWK-91: capture iframe navigation count before the drop. With the
    // path-aliased import (`@/lib/utils`) reachable through the fixture
    // shim, the optimizer must walk the alias-resolved module graph at
    // server boot too. If it doesn't, the first drop here triggers a
    // depOptimize-driven full reload of the iframe, the navigation count
    // bumps, and this assertion fails — proving the AWK-75 + AWK-91
    // interaction is correct end-to-end.
    const initialNavCount = await getIframeNavigationCount(page);
    expect(initialNavCount).toBe(1);

    await dropComponentOnCanvas(page, "Example", 150, 200);

    const canvas = page.frameLocator("iframe#canvas");
    // The component renders text `Example: alias-resolved` — proving the
    // aliased import was resolved by Deloop's middleware.
    await expect(canvas.getByText(/Example: alias-resolved/)).toBeVisible({
      timeout: 10_000,
    });

    // AWK-91: iframe must not have navigated again. A Vite full-reload
    // would bump `getEntriesByType("navigation").length` to 2.
    const postDropNavCount = await getIframeNavigationCount(page);
    expect(postDropNavCount).toBe(1);

    // No JS errors during the alias-resolved mount.
    expect(consoleErrors).toEqual([]);
  });
});

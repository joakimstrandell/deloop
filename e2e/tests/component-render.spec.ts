/**
 * E2E tests for the core component rendering pipeline.
 *
 * Pattern reference for all future E2E tests:
 * - The Deloop server starts automatically via playwright.config.ts webServer.
 * - Reach inside the canvas iframe with page.frameLocator('iframe#canvas').
 * - Use waitForSelector / toBeVisible for async rendering assertions.
 * - Assert on visible behavior, not class names or DOM structure.
 *
 * Under the strict shim-only discovery model (ADR-0005), `@deloop/ui`
 * ships `button.deloop.tsx` (trivial leaf) and `tooltip.deloop.tsx`
 * (provider-wrapping compound) as canonical examples — the assertions
 * below verify both shim shapes mount correctly end-to-end.
 */
import { test, expect } from "@playwright/test";

test.describe("component list", () => {
  test("shows Button and Tooltip from @deloop/ui shims", async ({ page }) => {
    await page.goto("/");

    // The sidebar discovers shim files under packages/ui/src/components/
    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByRole("button", { name: "Tooltip", exact: true })).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("canvas rendering", () => {
  test("clicking Button mounts it in the canvas iframe", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Click the Button entry in the sidebar.
    await page.getByRole("button", { name: "Button", exact: true }).click();

    // The canvas iframe should render a component card containing the button.
    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });
  });

  test("clicking Tooltip mounts a fully composed tooltip without console errors", async ({
    page,
  }) => {
    // Validates the provider-wrapping shim path (ADR-0005): a `Tooltip`
    // entry mounts the Tooltip composition with TooltipProvider + default
    // trigger + default content. A naive bare-file rendering would throw
    // because Radix Tooltip needs a TooltipProvider ancestor.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(err.message);
    });

    await page.goto("/");

    await expect(page.getByRole("button", { name: "Tooltip", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Tooltip", exact: true }).click();

    // The shim renders a "Hover me" Button as the trigger; its presence in
    // the iframe is enough to prove the composition mounted without
    // throwing on the provider context check.
    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button", { name: "Hover me" })).toBeVisible({
      timeout: 10_000,
    });

    // No React errors logged during the mount (the most common failure
    // mode here is "TooltipProvider was not found", which Radix raises as
    // a console error in development).
    expect(consoleErrors).toEqual([]);
  });
});

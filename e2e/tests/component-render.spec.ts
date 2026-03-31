/**
 * E2E tests for the core component rendering pipeline.
 *
 * Pattern reference for all future E2E tests:
 * - The Deloop server starts automatically via playwright.config.ts webServer.
 * - Reach inside the canvas iframe with page.frameLocator('iframe#canvas').
 * - Use waitForSelector / toBeVisible for async rendering assertions.
 * - Assert on visible behavior, not class names or DOM structure.
 */
import { test, expect } from "@playwright/test";

test.describe("component list", () => {
  test("shows Button from sample-app", async ({ page }) => {
    await page.goto("/");

    // The sidebar discovers components from packages/sample-app/src/components/
    await expect(page.getByText("Button")).toBeVisible({ timeout: 10_000 });
  });
});

test.describe("canvas rendering", () => {
  test("clicking Button mounts it in the canvas iframe", async ({ page }) => {
    await page.goto("/");

    // Wait for component list to load
    await expect(page.getByText("Button")).toBeVisible({ timeout: 10_000 });

    // Click the Button entry in the sidebar
    await page.getByRole("button", { name: "Button" }).click();

    // The canvas iframe should render a component card containing the button
    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button")).toBeVisible({ timeout: 10_000 });
  });
});

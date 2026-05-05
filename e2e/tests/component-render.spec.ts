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

  test("renders chrome inside shadow DOM and user component in light DOM (slotted)", async ({
    page,
  }) => {
    // AWK-13: Deloop's canvas chrome (grid + card frame + label + error
    // frame) lives inside an open shadow root attached to a host element;
    // the user component is a light-DOM child of that host with
    // `slot="card-<cardId>"`. This isolates Deloop's CSS from the user
    // project's CSS while letting the user's CSS reach the user component
    // naturally.
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Button", exact: true }).click();

    // Wait for the user's button to appear in the canvas.
    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });

    // The chrome host exists and has an attached shadow root containing
    // a `[data-deloop-chrome]` element. The host itself is in light DOM;
    // the chrome marker is reachable only via `host.shadowRoot`.
    const chromePlacement = await page.frame({ url: /iframe\.html/ })!.evaluate(() => {
      const host = document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null;
      if (!host) return { hasHost: false };
      const inLightDom = document.querySelector("[data-deloop-chrome]") != null;
      const shadow = host.shadowRoot;
      const inShadow = shadow != null && shadow.querySelector("[data-deloop-chrome]") != null;
      return { hasHost: true, inLightDom, inShadow };
    });

    expect(chromePlacement.hasHost).toBe(true);
    expect(chromePlacement.inShadow).toBe(true);
    // Chrome must NOT be reachable from light DOM — that's the whole
    // point of the isolation.
    expect(chromePlacement.inLightDom).toBe(false);

    // The user component (the @deloop/ui Button) is rendered inside a
    // slotted light-DOM wrapper, NOT inside the shadow root. We verify
    // both directions.
    const userComponentPlacement = await page.frame({ url: /iframe\.html/ })!.evaluate(() => {
      const host = document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null;
      if (!host) return { found: false };
      const slotted = host.querySelector('[slot^="card-"]') as HTMLElement | null;
      const slotName = slotted?.getAttribute("slot") ?? null;
      const slotContainsButton = slotted?.querySelector("button") != null;
      const shadowContainsUserButton =
        host.shadowRoot?.querySelector('[data-slot="button"]') != null;
      return { found: slotted != null, slotName, slotContainsButton, shadowContainsUserButton };
    });

    expect(userComponentPlacement.found).toBe(true);
    expect(userComponentPlacement.slotName).toMatch(/^card-/);
    expect(userComponentPlacement.slotContainsButton).toBe(true);
    // The user component should NOT live inside the shadow root — slot
    // projection is a render-time effect; the actual node stays in light
    // DOM where the user's CSS can reach it.
    expect(userComponentPlacement.shadowContainsUserButton).toBe(false);
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

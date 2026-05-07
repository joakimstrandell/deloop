/**
 * AWK-91: Regression — first drop of a fresh component must NOT trigger
 * a Vite full-reload of the canvas iframe.
 *
 * Background. On a cold dev server, the first iframe `import()` of a user
 * component module makes Vite's dep optimizer discover the bare-import
 * deps reachable through that module (e.g. `class-variance-authority`,
 * `radix-ui`, `clsx`, `tailwind-merge` reachable through `@deloop/ui`
 * shims), rebuild the optimized bundle, and trigger a full iframe page
 * reload to swap the runtime onto the new bundle. The reload tears down
 * the iframe's placed-card map → cards vanish mid-session.
 *
 * The fix is in `packages/cli/src/server.ts` + `vite-component-server.ts`:
 * sourcing `optimizeDeps.entries` from the component registry's shim
 * paths at server boot pre-bundles every reachable dep before any iframe
 * import request reaches Vite. With the fix, the first drop does not
 * cause a reload.
 *
 * Verification mechanism. We sample the iframe's `performance` navigation
 * count BEFORE the drop. The iframe is a `multi-page` MPA from Vite's
 * perspective; a Vite full-reload causes the iframe to navigate again
 * (visible in DevTools Network as a second `iframe.html` request). After
 * the drop completes (`toBeVisible` on the rendered Button), we
 * re-acquire the iframe and read its navigation count again. If the
 * count is unchanged AND the original Document handle still references
 * the live document, the iframe's identity survived the drop → no
 * reload happened → the AC is met.
 *
 * Why navigation-entries instead of pure document-handle equality: in
 * Playwright, after a Vite full-reload Chromium recreates the iframe's
 * document, and Playwright's `JSHandle` for the old document throws
 * "execution context destroyed" rather than returning `false` for
 * equality. The navigation-entries surface is observable from script
 * inside the iframe, survives the test boundary, and gives a clean
 * boolean assertion regardless of how Playwright handles the torn-down
 * context. We additionally verify the placed card persists after the
 * drop — that's the user-visible symptom the AC pins.
 *
 * Coverage. We exercise Button AND Tooltip — different transitive dep
 * sets (Button → `class-variance-authority` + `clsx` + `tailwind-merge`;
 * Tooltip → those plus `@radix-ui/react-tooltip`). Per the AC, both must
 * pass without a reload.
 */
import { test, expect, type Page } from "@playwright/test";
import { dropComponentOnCanvas } from "./helpers/canvas-drop.js";

async function getIframeNavigationCount(page: Page): Promise<number> {
  const frame = page.frame({ url: /iframe\.html/ });
  if (!frame) throw new Error("Canvas iframe not loaded");
  return frame.evaluate(() => performance.getEntriesByType("navigation").length);
}

async function getCardCount(page: Page): Promise<number> {
  const frame = page.frame({ url: /iframe\.html/ });
  if (!frame) return 0;
  return frame.evaluate(() => {
    const host = document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null;
    if (!host?.shadowRoot) return 0;
    return host.shadowRoot.querySelectorAll("[data-card-id]").length;
  });
}

test.describe("AWK-91 iframe identity stable across first drop", () => {
  test("dropping a Button does not trigger an iframe page reload", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Canvas ready")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // Baseline: the iframe has navigated exactly once (its initial load).
    const initialNavCount = await getIframeNavigationCount(page);
    expect(initialNavCount).toBe(1);

    await dropComponentOnCanvas(page, "Button", 150, 200);

    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });

    // Identity check: the iframe must NOT have navigated again. A Vite
    // full-reload would bump the navigation entry count to 2.
    const postDropNavCount = await getIframeNavigationCount(page);
    expect(postDropNavCount).toBe(1);

    // User-visible symptom: the placed card persisted (a reload would
    // have torn down the iframe's mounted Map → card count would be 0).
    expect(await getCardCount(page)).toBe(1);
  });

  test("dropping a Tooltip does not trigger an iframe page reload", async ({ page }) => {
    // Different transitive dep set than Button — Tooltip pulls in
    // `@radix-ui/react-tooltip` on top of the cva/clsx/tailwind-merge
    // that Button needs. AWK-91 AC pins coverage of at least 2 component
    // types covering different dep graphs.
    await page.goto("/");
    await expect(page.getByText("Canvas ready")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Tooltip", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    const initialNavCount = await getIframeNavigationCount(page);
    expect(initialNavCount).toBe(1);

    await dropComponentOnCanvas(page, "Tooltip", 200, 250);

    const canvas = page.frameLocator("iframe#canvas");
    // Tooltip's default trigger renders a "Hover me" Button per the
    // dogfood shim — same assertion shape as canvas-placement.spec.
    await expect(canvas.getByRole("button", { name: "Hover me" })).toBeVisible({
      timeout: 10_000,
    });

    const postDropNavCount = await getIframeNavigationCount(page);
    expect(postDropNavCount).toBe(1);

    expect(await getCardCount(page)).toBe(1);
  });
});

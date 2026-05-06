/**
 * E2E coverage for the canvas color-scheme toggle (AWK-79).
 *
 * AC verified here:
 *   - The shell topbar exposes a Sun/Moon/Monitor cycle button.
 *   - Clicking it advances the user's Mode (light → dark → system → light)
 *     and broadcasts the resolved scheme to the iframe.
 *   - When Mode flips to dark, the iframe's <html> gets `.dark` AND a
 *     known user-component token (Button background) repaints.
 *   - The shadow-DOM chrome host's `data-color-scheme` attribute follows
 *     the resolved scheme, so the chrome reacts in step.
 *   - The choice persists across reloads via `localStorage`.
 */
import { test, expect, type Page } from "@playwright/test";

const STORAGE_KEY = "deloop:color-scheme";

async function readDocColorScheme(page: Page) {
  return page
    .frameLocator("iframe#canvas")
    .locator("html")
    .evaluate((html) => ({
      classList: Array.from(html.classList),
      dataAttr: html.dataset["colorScheme"] ?? null,
    }));
}

async function readChromeHostScheme(page: Page) {
  return page
    .frame({ url: /iframe\.html/ })!
    .evaluate(
      () =>
        (document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null)?.dataset[
          "colorScheme"
        ] ?? null,
    );
}

async function readButtonBgColor(page: Page) {
  // The user component (the @deloop/ui Button shim) sits in light DOM
  // under the chrome host. Its background-color is driven by the
  // `--primary` CSS variable, which flips between :root and .dark.
  // Reading the computed style is the load-bearing assertion: it
  // proves theme tokens are actually being applied, not just that an
  // attribute changed.
  return page
    .frameLocator("iframe#canvas")
    .getByRole("button", { name: "Button", exact: true })
    .evaluate((btn) => window.getComputedStyle(btn).backgroundColor);
}

/**
 * Resets persisted Mode to a clean baseline. Done by navigating to the
 * shell, wiping the storage key, and reloading. `addInitScript` is the
 * obvious tool here, but it fires on every navigation — including the
 * in-test reload that the "persists across reloads" assertion needs to
 * preserve the user's choice. Hence the one-shot wipe-then-reload.
 */
async function resetMode(page: Page) {
  await page.goto("/");
  await page.evaluate((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // See readStoredMode() in color-scheme.ts for why we swallow.
    }
  }, STORAGE_KEY);
  await page.reload();
}

test.describe("AWK-79 canvas color-scheme toggle", () => {
  test.beforeEach(async ({ page }) => {
    await resetMode(page);
  });

  test("topbar exposes a cycle button with current-mode tooltip", async ({ page }) => {
    await page.goto("/");

    // Default mode is "system" on a clean profile. The button's
    // accessible label includes the current mode literal.
    const toggle = page.getByRole("button", { name: /System mode/i });
    await expect(toggle).toBeVisible();
  });

  test("clicking the toggle flips .dark on the iframe <html> and repaints the user button", async ({
    page,
  }) => {
    await page.goto("/");

    // Mount a Button so we have a known token to assert against.
    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Button", exact: true }).click();

    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });

    // Force the system to "light" first by clicking until the icon
    // matches — keeps the assertion independent of the OS preference
    // running the test (CI Linux defaults to light, but local macOS may
    // be dark and that would make "click once → dark" a no-op).
    const toggle = page.getByRole("button", { name: /(Light|Dark|System) mode/i });
    // Click until we land on Light explicitly. At most three clicks
    // (light → dark → system → light).
    for (let i = 0; i < 3; i++) {
      const label = (await toggle.getAttribute("aria-label")) ?? "";
      if (label.startsWith("Light mode")) break;
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-label", /^Light mode/);

    // Iframe <html> should NOT have .dark in light mode.
    let docInfo = await readDocColorScheme(page);
    expect(docInfo.classList).not.toContain("dark");
    expect(docInfo.dataAttr).toBe("light");

    const lightBg = await readButtonBgColor(page);

    // Cycle once: light → dark.
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-label", /^Dark mode/);

    // Wait for the iframe to apply .dark via the postMessage round trip.
    await expect
      .poll(async () => (await readDocColorScheme(page)).classList.includes("dark"), {
        timeout: 5_000,
      })
      .toBe(true);

    docInfo = await readDocColorScheme(page);
    expect(docInfo.classList).toContain("dark");
    expect(docInfo.dataAttr).toBe("dark");

    // The chrome host attribute follows.
    expect(await readChromeHostScheme(page)).toBe("dark");

    // The user component's computed background flipped — that's the
    // load-bearing AC ("flips theme tokens on user components").
    const darkBg = await readButtonBgColor(page);
    expect(darkBg).not.toBe(lightBg);
  });

  test("preference persists across reloads", async ({ page }) => {
    await page.goto("/");

    const toggle = page.getByRole("button", { name: /(Light|Dark|System) mode/i });

    // Land on Dark explicitly so the assertion doesn't depend on the
    // OS preference under the test runner.
    for (let i = 0; i < 3; i++) {
      const label = (await toggle.getAttribute("aria-label")) ?? "";
      if (label.startsWith("Dark mode")) break;
      await toggle.click();
    }
    await expect(toggle).toHaveAttribute("aria-label", /^Dark mode/);

    // localStorage carries the Mode literal verbatim.
    const stored = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
    expect(stored).toBe("dark");

    await page.reload();

    // After reload, the iframe's synchronous bootstrap should have
    // applied .dark before React paints — no flicker, no waiting.
    const docInfo = await readDocColorScheme(page);
    expect(docInfo.classList).toContain("dark");
    expect(docInfo.dataAttr).toBe("dark");

    const reloadedToggle = page.getByRole("button", { name: /^Dark mode/ });
    await expect(reloadedToggle).toBeVisible();
  });
});

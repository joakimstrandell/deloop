/**
 * E2E test for the sidebar's live update channel (AWK-12).
 *
 * Verifies the SSE round-trip end-to-end: a file appearing under the
 * sample-app's component sources shows up in the sidebar without a page
 * refresh, and a deletion is reflected the same way.
 *
 * The CLI server is started by playwright.config.ts pointing at
 * packages/sample-app. We write into that real directory using a unique
 * filename and clean up in afterEach so the test never leaves residue
 * even when assertions fail mid-flight.
 *
 * Drag interactions are intentionally NOT covered here — Playwright's
 * HTML5 drag-and-drop emulation is unreliable across browsers. The drag
 * payload contract is unit-tested in
 * `packages/app/src/shell/sidebar/ComponentList.test.ts` instead.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SAMPLE_COMPONENTS_DIR = resolve(repoRoot, "packages/sample-app/src/components");

// Unique name (per spec file run) so a leftover file from a crashed run
// won't conflict with a fresh run, and so the file is recognisable as
// test residue if something does leak.
const EPHEMERAL_NAME = "EphemeralAwk12";
const EPHEMERAL_PATH = resolve(SAMPLE_COMPONENTS_DIR, `${EPHEMERAL_NAME}.tsx`);
const EPHEMERAL_SOURCE = `export default function ${EPHEMERAL_NAME}() {
  return null;
}
`;

test.describe("sidebar live update", () => {
  test.afterEach(() => {
    if (existsSync(EPHEMERAL_PATH)) unlinkSync(EPHEMERAL_PATH);
  });

  test("reflects file add and unlink in the sidebar without refresh", async ({ page }) => {
    await page.goto("/");

    // Baseline: existing sample components are present, the ephemeral one
    // we're about to write is not.
    await expect(page.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: EPHEMERAL_NAME })).toHaveCount(0);

    writeFileSync(EPHEMERAL_PATH, EPHEMERAL_SOURCE);

    // 100ms debounce on the server + SSE round-trip + React render. 5s is
    // generous enough to absorb chokidar's startup latency on slow CI
    // runners without masking a real regression.
    await expect(page.getByRole("button", { name: EPHEMERAL_NAME })).toBeVisible({
      timeout: 5_000,
    });

    unlinkSync(EPHEMERAL_PATH);

    await expect(page.getByRole("button", { name: EPHEMERAL_NAME })).toHaveCount(0, {
      timeout: 5_000,
    });
  });
});

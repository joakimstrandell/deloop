/**
 * E2E test for the sidebar's live update channel (AWK-12, AWK-73).
 *
 * Verifies the SSE round-trip end-to-end: a shim file appearing under the
 * @deloop/ui component sources shows up in the sidebar without a page
 * refresh, and a deletion is reflected the same way.
 *
 * Under the strict shim-only model (ADR-0005) the discovered unit is a
 * `*.deloop.tsx` named export. We write a fresh `ephemeral.deloop.tsx`
 * exporting `Ephemeral` and assert its export identifier appears as a
 * sidebar entry — replacing the older bare-file `EphemeralAwk12.tsx` test
 * (which the new discovery rule would correctly ignore).
 *
 * The CLI server is started by playwright.config.ts pointing at
 * packages/ui. We write into that real directory using a unique filename
 * and clean up in afterEach so the test never leaves residue even when
 * assertions fail mid-flight.
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
const SAMPLE_COMPONENTS_DIR = resolve(repoRoot, "packages/ui/src/components");

// Unique name (per spec file run) so a leftover file from a crashed run
// won't conflict with a fresh run, and so the file is recognisable as
// test residue if something does leak.
const EPHEMERAL_NAME = "Ephemeral";
const EPHEMERAL_PATH = resolve(SAMPLE_COMPONENTS_DIR, `ephemeral.deloop.tsx`);
const EPHEMERAL_SOURCE = `export function ${EPHEMERAL_NAME}() {
  return null;
}
`;

test.describe("sidebar live update", () => {
  test.afterEach(() => {
    if (existsSync(EPHEMERAL_PATH)) unlinkSync(EPHEMERAL_PATH);
  });

  test("reflects shim add and unlink in the sidebar without refresh", async ({ page }) => {
    await page.goto("/");

    // Baseline: existing shim entries are present, the ephemeral one we're
    // about to write is not.
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

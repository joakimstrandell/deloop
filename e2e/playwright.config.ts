import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Two parallel Deloop instances run for E2E:
 *
 *   - `chromium` project (port 4242): the dogfood server pointed at
 *     `packages/ui`. Used by the broad component-render / shell /
 *     bootstrap / sidebar specs.
 *   - `chromium-tsconfig-app-split` project (port 4243): a fixture
 *     project under `e2e/fixtures/tsconfig-app-split/` whose path aliases
 *     live in `tsconfig.app.json` (with a stub `tsconfig.json`
 *     `references`-ing it). Verifies AWK-75 honors the split tsconfig
 *     layout.
 *
 * Each project filters by spec file via `testMatch` so the two webServers
 * stay independent; that also means the two run sequentially under
 * `fullyParallel: false`, which is fine — total runtime stays bounded.
 *
 * `workers: 1` keeps the suite serial. AWK-84 investigated relaxing it;
 * see the inline comment on `workers` for the trace.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  // Suite-wide single worker. AWK-84 investigated relaxing this.
  //
  // What was tried (Playwright 1.58.2):
  //
  // 1. Bumping global `workers: 4` (per-file parallelism within a project).
  //    `pnpm test:e2e` total wall time fell from ~22s to ~18s, but
  //    `color-scheme-toggle.spec.ts` flaked on >1 of 3 consecutive runs:
  //    the toggle's localStorage-reset-then-reload precondition raced
  //    against another worker's `page.goto("/")` against the same dev
  //    server (port 4242), producing a "Canvas hydrating…" snapshot
  //    instead of the ready chrome.
  //
  // 2. `workers: 2` was strictly worse — 9/21 failed on the first attempt,
  //    including all of `canvas-placement.spec.ts` and both
  //    `cli-bootstrap.spec.ts` cases (the bootstrap tests caught the dev
  //    server mid-`bootstrapDeloopDir` because `reuseExistingServer:
  //    !CI` lets two workers slam the server before its FS scaffolding
  //    has finished writing). Resolving this would require either:
  //      - a deterministic readiness signal beyond `webServer.url` (e.g.
  //        a /api/ready endpoint exposed only after `bootstrapDeloopDir`
  //        and the chokidar registry settle), or
  //      - removing `reuseExistingServer` so each run boots fresh — at
  //        the cost of ~15s extra startup per `pnpm test:e2e` invocation,
  //        which would dominate wall time.
  //
  // 3. Per-project `workers: N` is supported by Playwright (`TestProject`
  //    type), but doesn't help here: the `chromium` project owns 5 specs
  //    against a single dev server (port 4242), and that's where the
  //    contention lives. The `chromium-tsconfig-app-split` project has
  //    one spec, so per-project workers buys nothing.
  //
  // 4. `test.describe.configure({ mode: "serial" })` on the contentious
  //    specs (sidebar-live-update, color-scheme, canvas-placement) is a
  //    spec-file edit; out of scope per the AWK-84 locked-scope note
  //    ("Refactoring fixtures or specs themselves").
  //
  // Per `docs/agent/testing.md` "Test Determinism": flakes under
  // parallelism are a sign of races in the test instrumentation, not in
  // the implementation — the right fix is to make the test setup
  // deterministic (a wait-for-ready endpoint, clean per-test state) and
  // then re-investigate. Until that lands, `workers: 1` is the load-
  // bearing safety net for deterministic local + CI runs.
  workers: 1,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  reporter: [["html"], ["line"]],
  use: {
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4242" },
      testIgnore: ["**/tsconfig-paths-*.spec.ts"],
    },
    {
      name: "chromium-tsconfig-app-split",
      use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:4243" },
      testMatch: ["**/tsconfig-paths-*.spec.ts"],
    },
  ],
  webServer: [
    {
      // Run Deloop CLI pointed at packages/ui (Deloop dogfoods its own design
      // system) from the repo root. tsx runs TypeScript directly in development.
      command:
        "node node_modules/tsx/dist/cli.mjs packages/cli/src/index.ts --root packages/ui --port 4242 --no-open",
      cwd: repoRoot,
      url: "http://localhost:4242",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
    {
      // AWK-75: a parallel Deloop instance pointed at the tsconfig-app-split
      // fixture. Boots on a separate port so the dogfood server can keep
      // running.
      command:
        "node node_modules/tsx/dist/cli.mjs packages/cli/src/index.ts --root e2e/fixtures/tsconfig-app-split --port 4243 --no-open",
      cwd: repoRoot,
      url: "http://localhost:4243",
      reuseExistingServer: !process.env["CI"],
      timeout: 30_000,
    },
  ],
});

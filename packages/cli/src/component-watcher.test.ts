import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createComponentRegistry } from "./component-watcher.js";
import type { ComponentInfo, DiscoverComponentsOptions } from "./component-discovery.js";

// Hoisted mock state so we can stall and inspect calls from within tests.
// `override(callIndex)` lets a test return a synthetic result for a given
// call (useful for simulating a "slow disk" without timing fast-glob).
// `delay(callIndex)` resolves before the mock returns, simulating a refresh
// that finishes after the watcher invalidated the cache.
const discoveryHooks = vi.hoisted(() => ({
  override: null as null | ((callIndex: number) => Promise<unknown> | unknown),
  delay: null as null | ((callIndex: number) => Promise<void>),
  callCount: 0,
}));

vi.mock("./component-discovery.js", async () => {
  const actual = await vi.importActual<typeof import("./component-discovery.js")>(
    "./component-discovery.js",
  );
  return {
    ...actual,
    discoverComponents: vi.fn(
      async (
        projectRoot: string,
        options?: DiscoverComponentsOptions,
      ): Promise<ComponentInfo[]> => {
        const index = ++discoveryHooks.callCount;
        let result: ComponentInfo[] | null = null;
        if (discoveryHooks.override) {
          const overridden = await discoveryHooks.override(index);
          if (Array.isArray(overridden)) result = overridden as ComponentInfo[];
        }
        if (result === null) {
          result = await actual.discoverComponents(projectRoot, options);
        }
        if (discoveryHooks.delay) await discoveryHooks.delay(index);
        return result;
      },
    ),
  };
});

let root: string;
let cleanup: (() => Promise<void>) | null = null;

function makeRoot(): string {
  return join(tmpdir(), `deloop-watcher-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

beforeEach(() => {
  // Reset the shared mock state so each test sees a clean slate even
  // though `discoveryHooks` is hoisted to module scope.
  discoveryHooks.callCount = 0;
  discoveryHooks.override = null;
  discoveryHooks.delay = null;
});

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
  if (root) rmSync(root, { recursive: true, force: true });
});

async function waitFor<T>(
  predicate: () => Promise<T | null> | T | null,
  { timeout = 3000, interval = 25 }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      const value = await predicate();
      if (value !== null && value !== undefined) return value;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw lastError ?? new Error("waitFor timed out");
}

describe("createComponentRegistry", () => {
  it("returns the current set of components on first read", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const components = await registry.list();
    expect(components.map((c) => c.name)).toEqual(["Button"]);
  });

  it("re-discovers components when a new file is added", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    expect((await registry.list()).map((c) => c.name)).toEqual(["Button"]);

    writeFileSync(
      join(root, "src/components/Card.tsx"),
      "export default function Card(){ return null; }",
    );

    const list = await waitFor(async () => {
      const items = await registry.list();
      return items.length === 2 ? items : null;
    });
    expect(list.map((c) => c.name).sort()).toEqual(["Button", "Card"]);
  });

  it("re-discovers components when a file is removed", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );
    writeFileSync(
      join(root, "src/components/Card.tsx"),
      "export default function Card(){ return null; }",
    );

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    expect((await registry.list()).length).toBe(2);

    unlinkSync(join(root, "src/components/Card.tsx"));

    const list = await waitFor(async () => {
      const items = await registry.list();
      return items.length === 1 ? items : null;
    });
    expect(list.map((c) => c.name)).toEqual(["Button"]);
  });

  it("respects the components config override", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/widgets"), { recursive: true });
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/widgets/Slider.tsx"),
      "export default function Slider(){ return null; }",
    );
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );

    const registry = await createComponentRegistry(root, { components: ["src/widgets"] });
    cleanup = () => registry.close();

    const components = await registry.list();
    expect(components.map((c) => c.name)).toEqual(["Slider"]);
  });

  it("does not overwrite cache with a refresh result superseded by invalidate", async () => {
    // Race scenario: refresh() resolves with stale data after a watcher event
    // invalidates the cache. The generation guard should drop the stale result
    // so the next list() re-discovers from disk instead of returning old data.
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );

    let resolveStaleRefresh: () => void = () => undefined;
    const stallPromise = new Promise<void>((r) => {
      resolveStaleRefresh = r;
    });

    // For call #1, return a synthetic ["Button"] snapshot (pre-Card) and
    // delay the return until we've fired an invalidate event. Call #2
    // (post-invalidate) uses the real on-disk discovery and sees Card.
    discoveryHooks.override = (callIndex) => {
      if (callIndex === 1) {
        return [
          {
            name: "Button",
            path: join(root, "src/components/Button.tsx"),
            relativePath: "src/components/Button.tsx",
          },
        ] satisfies ComponentInfo[];
      }
      return null;
    };
    discoveryHooks.delay = async (callIndex) => {
      if (callIndex === 1) await stallPromise;
    };

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    // Start the stalled first refresh.
    const firstList = registry.list();

    // Wait for the stalled call to enter its post-snapshot wait.
    await waitFor(() => (discoveryHooks.callCount >= 1 ? true : null));

    // Now add a real file. The stalled refresh #1 will resolve with the
    // synthetic pre-Card snapshot; the watcher fires `invalidate`, bumping
    // the generation counter mid-flight.
    writeFileSync(
      join(root, "src/components/Card.tsx"),
      "export default function Card(){ return null; }",
    );

    // Give chokidar generous time to observe the add and fire `invalidate`.
    // On macOS the typical latency is <200ms, but CI can be slower.
    await new Promise((r) => setTimeout(r, 800));

    // Release the stalled first refresh — it returns the synthetic
    // ["Button"] snapshot. Generation has moved (invalidate ran), so the
    // result must NOT be committed to the cache.
    resolveStaleRefresh();
    const stale = await firstList;
    expect(stale.map((c) => c.name)).toEqual(["Button"]);

    // Critical check: the next list() must observe the freshly-invalidated
    // cache and re-discover from disk. If the generation guard regresses,
    // cache would still be ["Button"] (the stale snapshot) and this would
    // return ["Button"] — failing the assertion.
    const fresh = await registry.list();
    expect(fresh.map((c) => c.name).sort()).toEqual(["Button", "Card"]);

    // Two refresh calls expected: the stalled one and the one triggered
    // after invalidate. If only 1 happened, chokidar didn't fire (would
    // make this test inconclusive); fail loudly so it's not silently
    // green when the race protection regresses.
    expect(discoveryHooks.callCount).toBeGreaterThanOrEqual(2);
  });
});

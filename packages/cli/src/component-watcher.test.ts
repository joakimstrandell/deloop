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

// Hoisted controllable chokidar mock. By default the mock delegates to the
// real chokidar so existing tests continue to exercise the actual watcher.
// When `controlled` is set, `chokidar.watch` returns a synthetic watcher
// that records its event handlers; `emit(event)` fires them synchronously
// from a test, removing the dependency on real FS-event timing (which is
// flaky on Linux CI runners).
interface ControlledWatcher {
  on(event: string, handler: (path: string) => void): ControlledWatcher;
  close(): Promise<void>;
  emit(event: "add" | "unlink" | "change", path?: string): void;
}
const chokidarHooks = vi.hoisted(() => ({
  controlled: false,
  lastWatcher: null as ControlledWatcher | null,
}));

vi.mock("chokidar", async () => {
  const actual = await vi.importActual<typeof import("chokidar")>("chokidar");
  return {
    ...actual,
    default: {
      ...actual.default,
      watch: (paths: string | string[], options?: unknown) => {
        if (!chokidarHooks.controlled) {
          return actual.default.watch(paths, options as Parameters<typeof actual.default.watch>[1]);
        }
        const handlers = new Map<string, Array<(path: string) => void>>();
        const watcher: ControlledWatcher = {
          on(event, handler) {
            const list = handlers.get(event) ?? [];
            list.push(handler);
            handlers.set(event, list);
            return watcher;
          },
          async close() {
            handlers.clear();
          },
          emit(event, path = "") {
            const list = handlers.get(event);
            if (!list) return;
            for (const h of list) h(path);
          },
        };
        chokidarHooks.lastWatcher = watcher;
        return watcher;
      },
    },
  };
});

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

/** Default content for a shim file with one named export `<Name>`. */
function shimSource(name: string): string {
  return `export function ${name}(){ return null; }\n`;
}

beforeEach(() => {
  // Reset the shared mock state so each test sees a clean slate even
  // though `discoveryHooks` is hoisted to module scope.
  discoveryHooks.callCount = 0;
  discoveryHooks.override = null;
  discoveryHooks.delay = null;
  // Default to real chokidar; only the race test arms the controlled mode.
  chokidarHooks.controlled = false;
  chokidarHooks.lastWatcher = null;
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
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const components = await registry.list();
    expect(components.map((c) => c.name)).toEqual(["Button"]);
  });

  it("re-discovers components when a new shim is added", async () => {
    // Use the controllable chokidar mock so we can fire the `add` event
    // synchronously without depending on real FS-event latency, which is
    // flaky on Linux CI (and even occasionally on macOS).
    chokidarHooks.controlled = true;

    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    expect((await registry.list()).map((c) => c.name)).toEqual(["Button"]);

    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/card.deloop.tsx"));

    const list = await registry.list();
    expect(list.map((c) => c.name).sort()).toEqual(["Button", "Card"]);
  });

  it("re-discovers components when a shim is removed", async () => {
    chokidarHooks.controlled = true;

    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));
    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    expect((await registry.list()).length).toBe(2);

    unlinkSync(join(root, "src/components/card.deloop.tsx"));
    chokidarHooks.lastWatcher?.emit("unlink", join(root, "src/components/card.deloop.tsx"));

    const list = await registry.list();
    expect(list.map((c) => c.name)).toEqual(["Button"]);
  });

  it("respects the components config override", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/widgets"), { recursive: true });
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/widgets/slider.deloop.tsx"), shimSource("Slider"));
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    const registry = await createComponentRegistry(root, { components: ["src/widgets"] });
    cleanup = () => registry.close();

    const components = await registry.list();
    expect(components.map((c) => c.name)).toEqual(["Slider"]);
  });

  it("does not overwrite cache with a refresh result superseded by invalidate", async () => {
    // Race scenario: refresh() resolves with stale data after a watcher event
    // invalidates the cache. The generation guard should drop the stale result
    // so the next list() re-discovers from disk instead of returning old data.
    chokidarHooks.controlled = true;

    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

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
            path: join(root, "src/components/button.deloop.tsx"),
            relativePath: "src/components/button.deloop.tsx",
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

    // Now add a real shim on disk so the post-invalidate refresh (call #2)
    // sees both Button and Card via the real discoverComponents fallback.
    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));

    // Fire the `add` event synchronously through the controllable mock.
    expect(chokidarHooks.lastWatcher).not.toBeNull();
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/card.deloop.tsx"));

    // Release the stalled first refresh — it returns the synthetic
    // ["Button"] snapshot. Generation has moved (invalidate ran), so the
    // result must NOT be committed to the cache.
    resolveStaleRefresh();
    const stale = await firstList;
    expect(stale.map((c) => c.name)).toEqual(["Button"]);

    // Critical check: the next list() must observe the freshly-invalidated
    // cache and re-discover from disk.
    const fresh = await registry.list();
    expect(fresh.map((c) => c.name).sort()).toEqual(["Button", "Card"]);

    // Two refresh calls expected: the stalled one and the one triggered
    // after invalidate.
    expect(discoveryHooks.callCount).toBeGreaterThanOrEqual(2);
  });
});

describe("createComponentRegistry — subscribe (SSE source)", () => {
  beforeEach(() => {
    chokidarHooks.controlled = true;
  });

  it("publishes a discovery event on add, debounced by 100ms", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const events: ComponentInfo[][] = [];
    registry.subscribe((components) => events.push(components));

    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/card.deloop.tsx"));

    // No debounce-flush yet → no event delivered.
    await new Promise((r) => setTimeout(r, 60));
    expect(events).toHaveLength(0);

    // Past the 100ms debounce + microtask drain for the refresh.
    const [received] = await waitFor(() => (events.length >= 1 ? events : null));
    expect(received?.map((c) => c.name).sort()).toEqual(["Button", "Card"]);
  });

  it("publishes a discovery event on unlink", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));
    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const events: ComponentInfo[][] = [];
    registry.subscribe((components) => events.push(components));

    unlinkSync(join(root, "src/components/card.deloop.tsx"));
    chokidarHooks.lastWatcher?.emit("unlink", join(root, "src/components/card.deloop.tsx"));

    const [received] = await waitFor(() => (events.length >= 1 ? events : null));
    expect(received?.map((c) => c.name)).toEqual(["Button"]);
  });

  it("publishes on a change event when the export set actually changed", async () => {
    // A shim edit can add or remove named exports — the watcher must
    // re-discover and notify when the result differs from the prior snapshot.
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    // Prime `lastPublished` with the initial state so the diff guard has
    // something to compare against.
    const events: ComponentInfo[][] = [];
    registry.subscribe((components) => events.push(components));
    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/card.deloop.tsx"));
    await waitFor(() => (events.length >= 1 ? events : null));

    // Now edit the button shim to add a second named export.
    writeFileSync(
      join(root, "src/components/button.deloop.tsx"),
      `export function Button(){ return null; }\nexport function ButtonGhost(){ return null; }\n`,
    );
    chokidarHooks.lastWatcher?.emit("change", join(root, "src/components/button.deloop.tsx"));

    const after = await waitFor(() => (events.length >= 2 ? events[events.length - 1] : null));
    expect(after?.map((c) => c.name).sort()).toEqual(["Button", "ButtonGhost", "Card"]);
  });

  it("does NOT publish on a change event when the export set is unchanged", async () => {
    // Identity-preserving content edits (tweaking JSX inside an existing
    // shim) must not spam SSE subscribers — Vite HMR already covers those.
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const events: ComponentInfo[][] = [];
    registry.subscribe((components) => events.push(components));

    // Prime lastPublished by triggering one real publish first.
    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/card.deloop.tsx"));
    await waitFor(() => (events.length >= 1 ? events : null));
    const beforeCount = events.length;

    // Now fire a change with an identity-preserving edit (still exports
    // `Button`, just a JSX tweak in the body).
    writeFileSync(
      join(root, "src/components/button.deloop.tsx"),
      `export function Button(){ return /* tweaked */ null; }\n`,
    );
    chokidarHooks.lastWatcher?.emit("change", join(root, "src/components/button.deloop.tsx"));

    // Wait comfortably past the debounce window.
    await new Promise((r) => setTimeout(r, 250));
    expect(events.length).toBe(beforeCount);
  });

  it("coalesces a burst of add events into a single push", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/a.deloop.tsx"), shimSource("A"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const events: ComponentInfo[][] = [];
    registry.subscribe((components) => events.push(components));

    // Simulate a `git checkout`-style burst within the debounce window —
    // chokidar fires one event per file, but the registry's debounce should
    // collapse them into a single push.
    for (const name of ["B", "C", "D", "E"]) {
      writeFileSync(
        join(root, `src/components/${name.toLowerCase()}.deloop.tsx`),
        shimSource(name),
      );
      chokidarHooks.lastWatcher?.emit(
        "add",
        join(root, `src/components/${name.toLowerCase()}.deloop.tsx`),
      );
      await new Promise((r) => setTimeout(r, 20));
    }

    const [received] = await waitFor(() => (events.length >= 1 ? events : null));

    // Give the publisher generous time to fire any spurious extra events
    // we'd want to catch as a regression.
    await new Promise((r) => setTimeout(r, 200));

    expect(events).toHaveLength(1);
    expect(received?.map((c) => c.name).sort()).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("does not deliver superseded data to subscribers", async () => {
    chokidarHooks.controlled = true;

    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    let resolveStalledCall: () => void = () => undefined;
    const stallPromise = new Promise<void>((r) => {
      resolveStalledCall = r;
    });

    discoveryHooks.delay = async (callIndex) => {
      if (callIndex === 1) await stallPromise;
    };

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const events: ComponentInfo[][] = [];
    registry.subscribe((components) => events.push(components));

    // Trigger an initial refresh by reading list() — this kicks call #1,
    // which will stall in the mock until we release it.
    const inFlight = registry.list();
    await waitFor(() => (discoveryHooks.callCount >= 1 ? true : null));

    // Fire a chokidar add — happens while refresh #1 is stalled. The added
    // shim appears on disk so call #2 (post-invalidate) sees it.
    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/card.deloop.tsx"));

    // Release the stalled refresh #1 — its result is the pre-add snapshot
    // (just Button). If the publisher path naively dispatched this result,
    // subscribers would receive ["Button"] instead of ["Button", "Card"].
    resolveStalledCall();
    await inFlight;

    // Publisher should re-refresh after seeing generation moved, then
    // deliver the post-add list.
    const [received] = await waitFor(() => (events.length >= 1 ? events : null));

    expect(received?.map((c) => c.name).sort()).toEqual(["Button", "Card"]);
    expect(events.some((batch) => batch.map((c) => c.name).join(",") === "Button")).toBe(false);
  });

  it("unsubscribe stops further notifications", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(join(root, "src/components/button.deloop.tsx"), shimSource("Button"));

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const events: ComponentInfo[][] = [];
    const off = registry.subscribe((components) => events.push(components));

    writeFileSync(join(root, "src/components/card.deloop.tsx"), shimSource("Card"));
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/card.deloop.tsx"));
    await waitFor(() => (events.length >= 1 ? true : null));

    off();

    writeFileSync(join(root, "src/components/dialog.deloop.tsx"), shimSource("Dialog"));
    chokidarHooks.lastWatcher?.emit("add", join(root, "src/components/dialog.deloop.tsx"));
    await new Promise((r) => setTimeout(r, 250));

    expect(events).toHaveLength(1);
  });
});

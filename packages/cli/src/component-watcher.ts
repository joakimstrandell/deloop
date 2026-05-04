import chokidar, { type FSWatcher } from "chokidar";
import { join } from "node:path";
import {
  discoverComponents,
  type ComponentInfo,
  type DiscoverComponentsOptions,
} from "./component-discovery.js";

export interface ComponentRegistry {
  /** Returns the current component list, recomputing if the cache was invalidated. */
  list(): Promise<ComponentInfo[]>;
  /**
   * Subscribes to discovery events — fired when the set of component entries
   * changes on disk (file added or removed). Content edits do not fire this;
   * those flow through Vite HMR to the canvas iframe instead. Returns an
   * unsubscribe function.
   */
  subscribe(listener: (components: ComponentInfo[]) => void): () => void;
  /** Stops the underlying watcher and releases resources. */
  close(): Promise<void>;
}

/**
 * Debounce window for coalescing chokidar burst events (e.g. a `git checkout`
 * that adds 30 files would otherwise fan out to 30 SSE pushes). 100ms is
 * comfortably below the human-perceptible latency budget for "the sidebar
 * updated" while broad enough to absorb typical filesystem bursts.
 */
const PUBLISH_DEBOUNCE_MS = 100;

function watchPathFor(projectRoot: string, source: string): string {
  // chokidar accepts both globs and directory paths, so we resolve the raw
  // user entry against projectRoot without extra parsing. A glob like
  // "src/widgets/**/*.tsx" reaches chokidar unchanged.
  return join(projectRoot, source);
}

/**
 * Creates a component registry that re-discovers components when files in
 * the configured source directories change. The registry caches the last
 * known-good list and invalidates it on chokidar add/unlink/change events,
 * so callers (e.g. `/api/components`) always observe a fresh view.
 *
 * Subscribers (e.g. the SSE endpoint) receive a debounced notification with
 * the fresh list whenever the discoverable *set* changes — `add` or `unlink`.
 * `change` events invalidate the cache (a file's barrel-status could flip)
 * but do not trigger a notification, since the discoverable set is almost
 * always identical and Vite HMR already covers in-place content edits.
 *
 * Use `close()` to dispose of the watcher when shutting down.
 */
export async function createComponentRegistry(
  projectRoot: string,
  options: DiscoverComponentsOptions = {},
): Promise<ComponentRegistry> {
  const sources = options.components ?? ["src/components"];

  let cache: ComponentInfo[] | null = null;
  let pending: Promise<ComponentInfo[]> | null = null;

  // Generation counter — bumped on every `invalidate` event. A `refresh()`
  // call snapshots the generation it started under and only commits its
  // result to the cache if the generation hasn't moved since. This drops
  // results from refreshes that were superseded by an invalidate event
  // firing mid-flight, which would otherwise let stale data overwrite a
  // freshly-invalidated cache.
  let generation = 0;

  const subscribers = new Set<(components: ComponentInfo[]) => void>();
  let publishTimer: ReturnType<typeof setTimeout> | null = null;

  async function refresh(): Promise<ComponentInfo[]> {
    const startedAt = generation;
    const result = await discoverComponents(projectRoot, options);
    if (startedAt === generation) {
      cache = result;
    }
    return result;
  }

  function getOrStartRefresh(): Promise<ComponentInfo[]> {
    if (pending) return pending;
    pending = refresh().finally(() => {
      pending = null;
    });
    return pending;
  }

  function schedulePublish(): void {
    if (publishTimer) clearTimeout(publishTimer);
    publishTimer = setTimeout(() => {
      publishTimer = null;
      if (subscribers.size === 0) return;
      void publishCurrent();
    }, PUBLISH_DEBOUNCE_MS);
  }

  // Loop until we observe a refresh result that reflects the latest
  // generation. Without this, the publisher could resolve with a snapshot
  // taken before a chokidar event that fired during its in-flight refresh —
  // the cache side is protected by the generation guard inside refresh(),
  // but the publisher path also reads the result directly. Test:
  // `does not deliver superseded data to subscribers` in component-watcher.test.ts.
  async function publishCurrent(): Promise<void> {
    let components: ComponentInfo[];
    let startedAt: number;
    do {
      startedAt = generation;
      components = await getOrStartRefresh();
    } while (startedAt !== generation);
    if (subscribers.size === 0) return;
    for (const sub of subscribers) sub(components);
  }

  const watcher: FSWatcher | null =
    sources.length > 0
      ? chokidar.watch(
          sources.map((s) => watchPathFor(projectRoot, s)),
          {
            ignored: (path: string) =>
              /\.(test|spec|stories|story)\.(t|j)sx?$/.test(path) || path.includes("node_modules"),
            ignoreInitial: true,
            persistent: true,
          },
        )
      : null;

  if (watcher) {
    const invalidate = (): void => {
      cache = null;
      generation++;
    };
    const invalidateAndPublish = (): void => {
      invalidate();
      schedulePublish();
    };
    // `add` and `unlink` change the discoverable set — notify subscribers.
    watcher.on("add", invalidateAndPublish);
    watcher.on("unlink", invalidateAndPublish);
    // `change` invalidates the cache (a file's barrel-status could flip)
    // but the discoverable set almost always stays the same; Vite HMR
    // covers in-place content edits for already-mounted cards.
    watcher.on("change", invalidate);
  }

  return {
    async list(): Promise<ComponentInfo[]> {
      if (cache !== null) return cache;
      return getOrStartRefresh();
    },
    subscribe(listener): () => void {
      subscribers.add(listener);
      return () => {
        subscribers.delete(listener);
      };
    },
    async close(): Promise<void> {
      if (publishTimer) {
        clearTimeout(publishTimer);
        publishTimer = null;
      }
      subscribers.clear();
      if (watcher) await watcher.close();
    },
  };
}

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
  /** Stops the underlying watcher and releases resources. */
  close(): Promise<void>;
}

const GLOB_CHARS = /[*?{}[\]()!]/;

function watchPathFor(projectRoot: string, source: string): string {
  // chokidar accepts both globs and directory paths. We pass the raw user
  // entry through (resolved against projectRoot) so a glob like
  // "src/widgets/**/*.tsx" still works without extra parsing.
  if (GLOB_CHARS.test(source)) {
    return join(projectRoot, source);
  }
  return join(projectRoot, source);
}

/**
 * Creates a component registry that re-discovers components when files in
 * the configured source directories change. The registry caches the last
 * known-good list and invalidates it on chokidar add/unlink/change events,
 * so callers (e.g. `/api/components`) always observe a fresh view.
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

  async function refresh(): Promise<ComponentInfo[]> {
    const startedAt = generation;
    const result = await discoverComponents(projectRoot, options);
    if (startedAt === generation) {
      cache = result;
    }
    return result;
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
    watcher.on("add", invalidate);
    watcher.on("unlink", invalidate);
    watcher.on("change", invalidate);
  }

  return {
    async list(): Promise<ComponentInfo[]> {
      if (cache !== null) return cache;
      if (pending) return pending;
      pending = refresh().finally(() => {
        pending = null;
      });
      return pending;
    },
    async close(): Promise<void> {
      if (watcher) await watcher.close();
    },
  };
}

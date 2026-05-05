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
   * changes on disk (file added or removed, or a shim's named-export set
   * changed). Returns an unsubscribe function.
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

/** Stable structural compare on a sorted ComponentInfo[]. */
function componentsEqual(a: ComponentInfo[], b: ComponentInfo[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) return false;
    if (x.name !== y.name || x.path !== y.path || x.relativePath !== y.relativePath) {
      return false;
    }
  }
  return true;
}

/**
 * Creates a component registry that re-discovers components when files in
 * the configured source directories change. The registry caches the last
 * known-good list and invalidates it on chokidar add/unlink/change events,
 * so callers (e.g. `/api/components`) always observe a fresh view.
 *
 * Subscribers (e.g. the SSE endpoint) receive a debounced notification with
 * the fresh list whenever the discoverable *set* changes:
 *   - `add` / `unlink`: the file's entries appeared/disappeared — always
 *     publish.
 *   - `change`: a shim edit can add or remove named exports, which mutates
 *     the entry set. We re-discover and diff against the previous snapshot;
 *     identity-preserving edits (e.g. tweaking JSX inside an existing shim)
 *     don't trigger a publish.
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

  // Last published snapshot, used by the `change`-event diff guard so we
  // don't spam subscribers when a shim edit doesn't change its export set.
  let lastPublished: ComponentInfo[] | null = null;

  const subscribers = new Set<(components: ComponentInfo[]) => void>();
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  // When set, the next publish must compare against `lastPublished` and skip
  // delivery on equality. Set on `change`, cleared on `add` / `unlink`.
  let pendingPublishIsDiffOnly = false;

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

  function schedulePublish(diffOnly: boolean): void {
    // If an unconditional publish is already pending, don't downgrade it.
    if (publishTimer && !diffOnly) {
      pendingPublishIsDiffOnly = false;
    } else if (!publishTimer) {
      pendingPublishIsDiffOnly = diffOnly;
    }
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
  // but the publisher path also reads the result directly.
  async function publishCurrent(): Promise<void> {
    let components: ComponentInfo[];
    let startedAt: number;
    do {
      startedAt = generation;
      components = await getOrStartRefresh();
    } while (startedAt !== generation);
    if (subscribers.size === 0) return;
    const diffOnly = pendingPublishIsDiffOnly;
    pendingPublishIsDiffOnly = false;
    if (diffOnly && lastPublished !== null && componentsEqual(lastPublished, components)) {
      // Identity-preserving content edit — don't notify subscribers, but
      // keep `lastPublished` as-is so a subsequent change against the same
      // baseline still no-ops correctly.
      return;
    }
    lastPublished = components;
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
    const invalidateAndPublish = (diffOnly: boolean) => (): void => {
      invalidate();
      schedulePublish(diffOnly);
    };
    // `add` / `unlink` change the discoverable set unconditionally — publish.
    watcher.on("add", invalidateAndPublish(false));
    watcher.on("unlink", invalidateAndPublish(false));
    // `change` may add or remove named exports of a shim (or flip a
    // bare-file's barrel status), which mutates the entry set. Re-discover
    // and only publish when the result actually differs from the last
    // snapshot. Vite HMR still covers in-place content edits for already-
    // mounted cards; this channel is only for sidebar entry changes.
    watcher.on("change", invalidateAndPublish(true));
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

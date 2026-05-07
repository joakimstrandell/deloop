import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, normalize } from "node:path";
import { tmpdir } from "node:os";
import {
  canvasStyleEnvironmentPlugin,
  collectTsconfigAliasTargets,
  createUserAliasPlugin,
  createViteComponentServer,
  resolveUserPath,
} from "./vite-component-server.js";
import type { Plugin, UserConfig } from "vite";

/**
 * Type helpers — Vite types `transformIndexHtml` and `transform` as
 * possibly-object hooks; `canvasStyleEnvironmentPlugin` always sets the
 * object form. These narrow the union and let us call the handlers with
 * a synthetic `this` context for tests.
 */
function getTransformIndexHtmlHandler(plugin: Plugin) {
  const hook = plugin.transformIndexHtml;
  if (hook && typeof hook === "object" && "handler" in hook) {
    return hook.handler as (
      this: unknown,
      html: string,
      ctx: unknown,
    ) => string | null | undefined | { html?: string; tags?: unknown[] } | Promise<unknown>;
  }
  throw new Error("transformIndexHtml hook is not in object form");
}

function getTransformHandler(plugin: Plugin) {
  const hook = plugin.transform;
  if (typeof hook === "function") {
    return hook as unknown as (
      this: unknown,
      code: string,
      id: string,
    ) => null | { code: string; map: null } | Promise<null | { code: string; map: null }>;
  }
  if (hook && typeof hook === "object" && "handler" in hook) {
    return hook.handler as unknown as (
      this: unknown,
      code: string,
      id: string,
    ) => null | { code: string; map: null } | Promise<null | { code: string; map: null }>;
  }
  throw new Error("transform hook is missing");
}

const fakeIndexHtmlContext = (filename: string) => ({
  path: "/iframe.html",
  filename,
  server: undefined,
  bundle: undefined,
  chunk: undefined,
  originalUrl: undefined,
});

describe("canvasStyleEnvironmentPlugin — transformIndexHtml", () => {
  it("injects a <link> into iframe.html when one cssPath is set", async () => {
    const plugin = canvasStyleEnvironmentPlugin({
      cssPaths: ["/abs/path/to/user/globals.css"],
      componentsDir: null,
    });

    const handler = getTransformIndexHtmlHandler(plugin);
    const html = `<!doctype html><html><head><meta charset="UTF-8"></head><body></body></html>`;
    const result = (await handler.call(
      {},
      html,
      fakeIndexHtmlContext("/repo/packages/app/iframe.html"),
    )) as string;

    expect(result).toContain('<link rel="stylesheet"');
    expect(result).toContain('href="/@fs/abs/path/to/user/globals.css"');
    expect(result).toContain("data-deloop-user-css");
    expect(result.indexOf("data-deloop-user-css")).toBeLessThan(result.indexOf("</head>"));
  });

  it("injects N <link> tags in array order for multi-source styles", async () => {
    const plugin = canvasStyleEnvironmentPlugin({
      cssPaths: [
        "/abs/path/to/user/design-system.css",
        "/abs/path/to/user/overrides.css",
        "/abs/path/to/user/local.css",
      ],
      componentsDir: null,
    });

    const handler = getTransformIndexHtmlHandler(plugin);
    const html = `<!doctype html><html><head></head><body></body></html>`;
    const result = (await handler.call(
      {},
      html,
      fakeIndexHtmlContext("/repo/packages/app/iframe.html"),
    )) as string;

    // One <link> per entry, all marked with the data attr for traceability.
    expect((result.match(/data-deloop-user-css/g) ?? []).length).toBe(3);
    // Order is preserved verbatim — earliest entry first, latest last so
    // it wins on cascade tie.
    const dsIdx = result.indexOf("design-system.css");
    const ovIdx = result.indexOf("overrides.css");
    const lcIdx = result.indexOf("local.css");
    expect(dsIdx).toBeGreaterThan(-1);
    expect(ovIdx).toBeGreaterThan(dsIdx);
    expect(lcIdx).toBeGreaterThan(ovIdx);
    // All three land inside <head>.
    expect(lcIdx).toBeLessThan(result.indexOf("</head>"));
  });

  it("does not modify the shell index.html", async () => {
    const plugin = canvasStyleEnvironmentPlugin({
      cssPaths: ["/abs/path/to/user/globals.css"],
      componentsDir: null,
    });

    const handler = getTransformIndexHtmlHandler(plugin);
    const html = `<!doctype html><html><head></head><body></body></html>`;
    const result = await handler.call(
      {},
      html,
      fakeIndexHtmlContext("/repo/packages/app/index.html"),
    );

    expect(result).toBe(html);
  });

  it("is a no-op when cssPaths is empty", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPaths: [], componentsDir: null });

    const handler = getTransformIndexHtmlHandler(plugin);
    const html = `<!doctype html><html><head></head><body></body></html>`;
    const result = await handler.call(
      {},
      html,
      fakeIndexHtmlContext("/repo/packages/app/iframe.html"),
    );

    expect(result).toBe(html);
  });

  it("escapes attribute-unsafe characters in the href", async () => {
    const plugin = canvasStyleEnvironmentPlugin({
      cssPaths: ['/abs/path/has "quote".css'],
      componentsDir: null,
    });

    const handler = getTransformIndexHtmlHandler(plugin);
    const html = `<head></head>`;
    const result = (await handler.call({}, html, fakeIndexHtmlContext("/x/iframe.html"))) as string;

    expect(result).not.toContain('"quote"');
    expect(result).toContain("&quot;");
  });
});

describe("canvasStyleEnvironmentPlugin — transform", () => {
  let tmpRoot: string;
  const componentsDir = "/abs/path/to/user/src/components";

  function makeTmp(): string {
    return join(tmpdir(), `deloop-vite-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  }

  function writeCss(root: string, name: string, contents: string): string {
    mkdirSync(root, { recursive: true });
    const path = join(root, name);
    writeFileSync(path, contents, "utf8");
    return path;
  }

  afterEach(() => {
    if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("prepends @source for the user CSS when componentsDir is set", async () => {
    tmpRoot = makeTmp();
    const cssPath = writeCss(tmpRoot, "globals.css", `body { color: red; }`);
    const plugin = canvasStyleEnvironmentPlugin({ cssPaths: [cssPath], componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body { color: red; }`, cssPath);

    expect(result).not.toBeNull();
    if (result == null) throw new Error("expected non-null result");
    expect(result.code).toBe(`@source "${componentsDir}";\nbody { color: red; }`);
  });

  it("matches the CSS file even when Vite appends a query string", async () => {
    tmpRoot = makeTmp();
    const cssPath = writeCss(tmpRoot, "globals.css", `body {}`);
    const plugin = canvasStyleEnvironmentPlugin({ cssPaths: [cssPath], componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, `${cssPath}?direct`);

    expect(result).not.toBeNull();
  });

  it("is a no-op for files other than the resolved user CSS", async () => {
    tmpRoot = makeTmp();
    const cssPath = writeCss(tmpRoot, "globals.css", `body {}`);
    const plugin = canvasStyleEnvironmentPlugin({ cssPaths: [cssPath], componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, "/abs/path/to/other.css");

    expect(result).toBeNull();
  });

  it("respects an existing @source directive in the user's CSS", async () => {
    tmpRoot = makeTmp();
    // The file already declares @source; pickPrependTarget should skip
    // it, so nothing matches at transform time.
    const cssPath = writeCss(
      tmpRoot,
      "globals.css",
      `@import "tailwindcss";\n@source "./components";\nbody {}`,
    );
    const plugin = canvasStyleEnvironmentPlugin({ cssPaths: [cssPath], componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call(
      {},
      `@import "tailwindcss";\n@source "./components";\nbody {}`,
      cssPath,
    );

    expect(result).toBeNull();
  });

  it("is a no-op when componentsDir is null", async () => {
    tmpRoot = makeTmp();
    const cssPath = writeCss(tmpRoot, "globals.css", `body {}`);
    const plugin = canvasStyleEnvironmentPlugin({ cssPaths: [cssPath], componentsDir: null });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, cssPath);

    expect(result).toBeNull();
  });

  it("is a no-op when cssPaths is empty", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPaths: [], componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, "/anything.css");

    expect(result).toBeNull();
  });

  it("prepends @source on the first entry that lacks @source, not subsequent entries", async () => {
    // Multi-source: first entry has no @source → it gets the prepend.
    // Second entry is a plain override and is left alone, even though
    // it also lacks @source.
    tmpRoot = makeTmp();
    const dsPath = writeCss(tmpRoot, "design-system.css", `body { color: red; }`);
    const overridePath = writeCss(tmpRoot, "overrides.css", `body { color: blue; }`);
    const plugin = canvasStyleEnvironmentPlugin({
      cssPaths: [dsPath, overridePath],
      componentsDir,
    });
    const handler = getTransformHandler(plugin);

    const dsResult = await handler.call({}, `body { color: red; }`, dsPath);
    const ovResult = await handler.call({}, `body { color: blue; }`, overridePath);

    expect(dsResult).not.toBeNull();
    if (dsResult == null) throw new Error("expected design-system result");
    expect(dsResult.code).toBe(`@source "${componentsDir}";\nbody { color: red; }`);
    // The second entry is intentionally untouched.
    expect(ovResult).toBeNull();
  });

  it("skips an entry that already declares @source and lands the prepend on the next entry without one", async () => {
    tmpRoot = makeTmp();
    const dsPath = writeCss(
      tmpRoot,
      "design-system.css",
      `@import "tailwindcss";\n@source "./components";\nbody {}`,
    );
    const overridePath = writeCss(tmpRoot, "overrides.css", `body { color: blue; }`);
    const plugin = canvasStyleEnvironmentPlugin({
      cssPaths: [dsPath, overridePath],
      componentsDir,
    });
    const handler = getTransformHandler(plugin);

    const dsResult = await handler.call({}, `@source "./components";\nbody {}`, dsPath);
    const ovResult = await handler.call({}, `body { color: blue; }`, overridePath);

    // First entry already has @source — left alone.
    expect(dsResult).toBeNull();
    // Second entry is the first-without-@source — gets the prepend.
    expect(ovResult).not.toBeNull();
    if (ovResult == null) throw new Error("expected override result");
    expect(ovResult.code).toBe(`@source "${componentsDir}";\nbody { color: blue; }`);
  });

  it("does not prepend on any entry when every entry already has @source", async () => {
    tmpRoot = makeTmp();
    const aPath = writeCss(tmpRoot, "a.css", `@source "./a";\nbody {}`);
    const bPath = writeCss(tmpRoot, "b.css", `@source "./b";\nbody {}`);
    const plugin = canvasStyleEnvironmentPlugin({
      cssPaths: [aPath, bPath],
      componentsDir,
    });
    const handler = getTransformHandler(plugin);

    expect(await handler.call({}, `@source "./a";\nbody {}`, aPath)).toBeNull();
    expect(await handler.call({}, `@source "./b";\nbody {}`, bPath)).toBeNull();
  });
});

describe("resolveUserPath", () => {
  it("joins relative paths against the project root", () => {
    expect(resolveUserPath("/repo/proj", "src/styles/globals.css")).toBe(
      "/repo/proj/src/styles/globals.css",
    );
  });

  it("returns absolute paths unchanged", () => {
    expect(resolveUserPath("/repo/proj", "/abs/elsewhere.css")).toBe("/abs/elsewhere.css");
  });
});

/**
 * AWK-75: tsconfig path-alias propagation.
 *
 * These tests cover the four guarantees the spec calls out:
 *  1. The plugin receives the correct `projects` paths (only existing
 *     files are passed through).
 *  2. `server.fs.allow` is expanded to include directories the resolved
 *     aliases point at — both tsconfig-derived and explicit overrides.
 *  3. Escape-hatch override precedence: when both tsconfig and
 *     `.deloop/config.ts` define the same alias key, the explicit one
 *     wins. This is asserted by checking plugin registration order.
 *  4. Malformed / missing tsconfig falls back gracefully — no throw, a
 *     single stderr warning, and the dev server still spins up.
 */
describe("AWK-75 tsconfig path-alias propagation", () => {
  let tmpRoots: string[] = [];

  function makeProjectRoot(): string {
    const root = join(
      tmpdir(),
      `deloop-tsconfig-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(root, { recursive: true });
    tmpRoots.push(root);
    return root;
  }

  function writeFile(path: string, contents: string): void {
    mkdirSync(join(path, "..").replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }

  afterEach(() => {
    for (const root of tmpRoots) {
      rmSync(root, { recursive: true, force: true });
    }
    tmpRoots = [];
  });

  describe("collectTsconfigAliasTargets", () => {
    it("resolves @/* paths against the tsconfig directory", async () => {
      const root = makeProjectRoot();
      mkdirSync(join(root, "src"), { recursive: true });
      writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
          },
        }),
      );

      const targets = await collectTsconfigAliasTargets([join(root, "tsconfig.json")]);

      expect(targets).toContain(normalize(join(root, "src")));
    });

    it("resolves paths declared in tsconfig.app.json (the split case)", async () => {
      const root = makeProjectRoot();
      mkdirSync(join(root, "src"), { recursive: true });
      writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({
          files: [],
          references: [{ path: "./tsconfig.app.json" }],
        }),
      );
      writeFile(
        join(root, "tsconfig.app.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
          },
        }),
      );

      const targets = await collectTsconfigAliasTargets([
        join(root, "tsconfig.json"),
        join(root, "tsconfig.app.json"),
      ]);

      expect(targets).toContain(normalize(join(root, "src")));
    });

    it("follows extends chains and surfaces inherited paths", async () => {
      const root = makeProjectRoot();
      mkdirSync(join(root, "src"), { recursive: true });
      // Base config holds the paths; the leaf merely extends it. tsconfck
      // merges paths from the entire chain — the AC step (3) requirement.
      writeFile(
        join(root, "tsconfig.base.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
          },
        }),
      );
      writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({
          extends: "./tsconfig.base.json",
          compilerOptions: {},
        }),
      );

      const targets = await collectTsconfigAliasTargets([join(root, "tsconfig.json")]);

      // tsconfck canonicalizes baseUrl through realpath, so on macOS the
      // result lives under `/private/var/...` while os.tmpdir() returns
      // the symlink form `/var/...`. Both refer to the same directory.
      // Canonicalize the expectation to match.
      const expected = normalize(join(realpathSync(root), "src"));
      expect(targets).toContain(expected);
    });

    it("follows package-style extends (e.g. @tsconfig/<pkg>) via node_modules", async () => {
      // AWK-75 AC step (3) explicitly calls out package-style extends —
      // `"extends": "@tsconfig/<pkg>/tsconfig.json"` — alongside relative
      // extends. tsconfck performs the lookup through `node_modules`, so
      // we stage a real package file on disk and assert that paths declared
      // in the base surface through the leaf.
      const root = makeProjectRoot();
      // Stage `node_modules/@tsconfig/test-base/tsconfig.json` — the literal
      // package name is irrelevant; what matters is that resolution walks
      // `node_modules/<scope>/<pkg>/tsconfig.json`.
      const pkgDir = join(root, "node_modules", "@tsconfig", "test-base");
      mkdirSync(pkgDir, { recursive: true });
      mkdirSync(join(pkgDir, "src"), { recursive: true });
      writeFile(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: "@tsconfig/test-base", version: "0.0.0" }),
      );
      writeFile(
        join(pkgDir, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
          },
        }),
      );
      writeFile(
        join(root, "tsconfig.json"),
        JSON.stringify({
          extends: "@tsconfig/test-base/tsconfig.json",
          compilerOptions: {},
        }),
      );

      const targets = await collectTsconfigAliasTargets([join(root, "tsconfig.json")]);

      // The base tsconfig lives inside the package directory, so
      // `baseUrl: "."` resolves against the package — `./src/*` then
      // points at `node_modules/@tsconfig/test-base/src`. We canonicalize
      // through realpathSync for the same `/private/var` vs `/var` reason
      // as the relative-extends test above (Node's module resolver may
      // also realpath the package, so the path may live under `/private`).
      const expected = normalize(join(realpathSync(pkgDir), "src"));
      expect(targets).toContain(expected);
    });

    it("returns an empty list for a tsconfig with no paths field", async () => {
      const root = makeProjectRoot();
      writeFile(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { baseUrl: "." } }));

      const targets = await collectTsconfigAliasTargets([join(root, "tsconfig.json")]);

      expect(targets).toEqual([]);
    });

    it("does not throw when the tsconfig is malformed; logs a single warning", async () => {
      const root = makeProjectRoot();
      writeFile(join(root, "tsconfig.json"), "{ this is not json");

      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const targets = await collectTsconfigAliasTargets([join(root, "tsconfig.json")]);
        expect(targets).toEqual([]);
        // Filter to our own warnings — Vite / tsconfck may write unrelated
        // chunks to stderr during the parse, so a bare `toHaveBeenCalled`
        // doesn't prove "exactly one warning per parse failure". The
        // contract we care about is: one `[deloop] failed to read …`
        // warning per malformed tsconfig.
        const deloopWarnings = stderr.mock.calls.filter(
          ([msg]) => typeof msg === "string" && msg.includes("[deloop] failed to read"),
        );
        expect(deloopWarnings).toHaveLength(1);
      } finally {
        stderr.mockRestore();
      }
    });

    it("does not throw when the tsconfig file is missing entirely", async () => {
      const root = makeProjectRoot();
      const missing = join(root, "tsconfig.json");

      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const targets = await collectTsconfigAliasTargets([missing]);
        expect(targets).toEqual([]);
      } finally {
        stderr.mockRestore();
      }
    });
  });

  describe("createUserAliasPlugin", () => {
    it("returns null when there are no aliases to register", () => {
      const plugin = createUserAliasPlugin("/repo/proj", {});
      expect(plugin).toBeNull();
    });

    it("emits a vite resolve.alias array with relative targets joined to projectRoot", () => {
      const plugin = createUserAliasPlugin("/repo/proj", {
        "@": "./src",
        "@ui": "/abs/ui",
      });
      expect(plugin).not.toBeNull();
      if (plugin == null) throw new Error("expected plugin");

      const configFn = plugin.config as (() => UserConfig) | undefined;
      expect(typeof configFn).toBe("function");
      const cfg = configFn!.call({} as never) as UserConfig;
      const aliasArray = cfg.resolve?.alias as { find: string; replacement: string }[] | undefined;

      expect(aliasArray).toBeDefined();
      expect(aliasArray!.find((a) => a.find === "@")?.replacement).toBe(
        normalize("/repo/proj/src"),
      );
      expect(aliasArray!.find((a) => a.find === "@ui")?.replacement).toBe(normalize("/abs/ui"));
    });

    it("registers with `enforce: pre` so it runs before vite-tsconfig-paths", () => {
      const plugin = createUserAliasPlugin("/repo/proj", { "@": "./src" });
      expect(plugin).not.toBeNull();
      expect(plugin?.enforce).toBe("pre");
    });
  });

  describe("createViteComponentServer integration", () => {
    it("expands server.fs.allow with tsconfig-derived alias directories", async () => {
      const projectRoot = makeProjectRoot();
      mkdirSync(join(projectRoot, "src"), { recursive: true });
      writeFile(
        join(projectRoot, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
          },
        }),
      );

      const server = await createViteComponentServer(projectRoot);
      try {
        const allow = server.config.server.fs.allow;
        expect(allow).toEqual(expect.arrayContaining([normalize(join(projectRoot, "src"))]));
        // Original entries are still present.
        expect(allow).toEqual(expect.arrayContaining([projectRoot]));
      } finally {
        await server.close();
      }
    });

    it("expands server.fs.allow with explicit user-alias targets too", async () => {
      const projectRoot = makeProjectRoot();
      const sibling = makeProjectRoot(); // different temp dir → outside projectRoot

      const server = await createViteComponentServer(
        projectRoot,
        { cssPaths: [], componentsDir: null },
        { userAliases: { "@sibling": sibling } },
      );
      try {
        const allow = server.config.server.fs.allow;
        expect(allow).toEqual(expect.arrayContaining([normalize(sibling)]));
      } finally {
        await server.close();
      }
    });

    it("registers the user-alias plugin BEFORE vite-tsconfig-paths so explicit aliases win on key collision", async () => {
      const projectRoot = makeProjectRoot();
      mkdirSync(join(projectRoot, "src"), { recursive: true });
      writeFile(
        join(projectRoot, "tsconfig.json"),
        JSON.stringify({
          compilerOptions: {
            baseUrl: ".",
            paths: { "@/*": ["./src/*"] },
          },
        }),
      );

      const server = await createViteComponentServer(
        projectRoot,
        { cssPaths: [], componentsDir: null },
        { userAliases: { "@": "./override-src" } },
      );
      try {
        const plugins = server.config.plugins as { name: string }[];
        const userIdx = plugins.findIndex((p) => p?.name === "deloop:user-aliases");
        const tsconfigIdx = plugins.findIndex((p) => p?.name === "vite-tsconfig-paths");
        expect(userIdx).toBeGreaterThanOrEqual(0);
        expect(tsconfigIdx).toBeGreaterThanOrEqual(0);
        // Plugins running with `enforce: 'pre'` run before non-`pre`
        // plugins, but we also rely on registration order between two
        // `pre`-stage plugins. Asserting the array order here protects
        // against regressions where the user plugin loses its slot.
        expect(userIdx).toBeLessThan(tsconfigIdx);
      } finally {
        await server.close();
      }
    });

    it("still boots when the user project has no tsconfig at all", async () => {
      const projectRoot = makeProjectRoot();
      const server = await createViteComponentServer(projectRoot);
      try {
        // No tsconfig, so vite-tsconfig-paths is not registered. The
        // server should still expose `fs.allow` containing projectRoot.
        expect(server.config.server.fs.allow).toEqual(expect.arrayContaining([projectRoot]));
      } finally {
        await server.close();
      }
    });

    it("does not crash on a malformed tsconfig — logs a warning and falls back to no aliases", async () => {
      const projectRoot = makeProjectRoot();
      writeFile(join(projectRoot, "tsconfig.json"), "{ broken json");

      const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
      try {
        const server = await createViteComponentServer(projectRoot);
        try {
          // Server still up — the AC says malformed tsconfig must NOT
          // crash the dev server.
          expect(server.config.server.fs.allow).toEqual(expect.arrayContaining([projectRoot]));
        } finally {
          await server.close();
        }
      } finally {
        stderr.mockRestore();
      }
    });
  });
});

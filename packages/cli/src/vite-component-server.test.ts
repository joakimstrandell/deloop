import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { canvasStyleEnvironmentPlugin, resolveUserPath } from "./vite-component-server.js";
import type { Plugin } from "vite";

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

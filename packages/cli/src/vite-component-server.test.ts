import { describe, it, expect } from "vitest";
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
  it("injects a <link> into iframe.html when cssPath is set", async () => {
    const plugin = canvasStyleEnvironmentPlugin({
      cssPath: "/abs/path/to/user/globals.css",
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

  it("does not modify the shell index.html", async () => {
    const plugin = canvasStyleEnvironmentPlugin({
      cssPath: "/abs/path/to/user/globals.css",
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

  it("is a no-op when cssPath is null", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPath: null, componentsDir: null });

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
      cssPath: '/abs/path/has "quote".css',
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
  const cssPath = "/abs/path/to/user/globals.css";
  const componentsDir = "/abs/path/to/user/src/components";

  it("prepends @source for the user CSS when componentsDir is set", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPath, componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body { color: red; }`, cssPath);

    expect(result).not.toBeNull();
    if (result == null) throw new Error("expected non-null result");
    expect(result.code).toBe(`@source "${componentsDir}";\nbody { color: red; }`);
  });

  it("matches the CSS file even when Vite appends a query string", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPath, componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, `${cssPath}?direct`);

    expect(result).not.toBeNull();
  });

  it("is a no-op for files other than the resolved user CSS", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPath, componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, "/abs/path/to/other.css");

    expect(result).toBeNull();
  });

  it("respects an existing @source directive in the user's CSS", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPath, componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call(
      {},
      `@import "tailwindcss";\n@source "./components";\nbody {}`,
      cssPath,
    );

    expect(result).toBeNull();
  });

  it("is a no-op when componentsDir is null", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPath, componentsDir: null });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, cssPath);

    expect(result).toBeNull();
  });

  it("is a no-op when cssPath is null", async () => {
    const plugin = canvasStyleEnvironmentPlugin({ cssPath: null, componentsDir });
    const handler = getTransformHandler(plugin);

    const result = await handler.call({}, `body {}`, cssPath);

    expect(result).toBeNull();
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

/**
 * Unit tests for the server's pure helpers — `resolveCanvasStyleConfig`
 * and `warnNoCssResolved`. Booting an Express + Vite server in unit
 * tests is overkill; these helpers carry the AWK-13 cycle-2 contract
 * (multi-source resolution, warn-once on empty resolution) and are
 * exercisable in isolation.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveCanvasStyleConfig, warnNoCssResolved } from "./server.js";
import { loadDeloopConfig } from "./config-loader.js";

let root: string;

function makeRoot(): string {
  return join(tmpdir(), `deloop-server-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("resolveCanvasStyleConfig", () => {
  it("returns an empty cssPaths list when neither config nor auto-detect resolves anything", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const result = resolveCanvasStyleConfig(root, undefined, undefined);

    expect(result.cssPaths).toEqual([]);
    expect(result.componentsDir).toBeNull();
  });

  it("auto-detects a conventional CSS path when styles is undefined", () => {
    root = makeRoot();
    mkdirSync(join(root, "src/styles"), { recursive: true });
    writeFileSync(join(root, "src/styles/globals.css"), "/* x */", "utf8");

    const result = resolveCanvasStyleConfig(root, undefined, undefined);

    expect(result.cssPaths).toHaveLength(1);
    expect(result.cssPaths[0]).toMatch(/src\/styles\/globals\.css$/);
  });

  it("resolves a single configured styles string to an absolute path even when missing on disk", () => {
    // Per cycle-2 spec: per-entry existence is NOT pre-validated.
    // Missing files become a 404 at runtime — that's the user's signal.
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const result = resolveCanvasStyleConfig(root, "src/styles/missing.css", undefined);

    expect(result.cssPaths).toHaveLength(1);
    expect(result.cssPaths[0]).toMatch(/src\/styles\/missing\.css$/);
  });

  it("resolves an array of configured styles to absolute paths in order", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const result = resolveCanvasStyleConfig(
      root,
      ["design-system.css", "overrides.css"],
      undefined,
    );

    expect(result.cssPaths).toHaveLength(2);
    expect(result.cssPaths[0]).toMatch(/design-system\.css$/);
    expect(result.cssPaths[1]).toMatch(/overrides\.css$/);
  });

  it("treats an empty array as 'configured but nothing resolved' (still triggers warn at server start)", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const result = resolveCanvasStyleConfig(root, [], undefined);

    // Empty input means no entries to inject; warn-once will fire.
    // Auto-detect is intentionally skipped — the user explicitly opted
    // out by setting `styles: []`.
    expect(result.cssPaths).toEqual([]);
  });

  it("does not auto-detect when styles is explicitly configured (even to a missing path)", () => {
    // Auto-detect is the fallback for *no* config; an explicit value —
    // even one pointing nowhere — wins.
    root = makeRoot();
    mkdirSync(join(root, "src/styles"), { recursive: true });
    writeFileSync(join(root, "src/styles/globals.css"), "/* x */", "utf8");

    const result = resolveCanvasStyleConfig(root, "custom/path.css", undefined);

    expect(result.cssPaths).toHaveLength(1);
    expect(result.cssPaths[0]).toMatch(/custom\/path\.css$/);
    expect(result.cssPaths[0]).not.toMatch(/globals\.css$/);
  });

  it("resolves componentsDir to an absolute path when configured", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const result = resolveCanvasStyleConfig(root, undefined, "src/components");

    expect(result.componentsDir).toMatch(/src\/components$/);
  });
});

describe("warnNoCssResolved", () => {
  // process.stderr.write has overloads vitest's spy generics can't capture
  // cleanly; the explicit `any` here is the smallest local escape hatch.
  // The mock body returns `true` to satisfy the runtime contract.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("writes the no-CSS warning to stderr exactly once", () => {
    warnNoCssResolved();

    expect(writeSpy).toHaveBeenCalledTimes(1);
    const written = writeSpy.mock.calls[0]?.[0];
    expect(typeof written).toBe("string");
    expect(written).toContain("[deloop] No CSS entry found.");
    expect(written).toContain("Components will render without your design system.");
    expect(written).toContain(".deloop/config.ts");
    expect(written).toContain("src/styles/globals.css");
  });
});

describe("resolveCanvasStyleConfig + warn integration (mirrors startServer's branch)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeSpy: any;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  it("warns exactly once when nothing resolves", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const style = resolveCanvasStyleConfig(root, undefined, undefined);
    if (style.cssPaths.length === 0) warnNoCssResolved();

    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it("does not warn when at least one path resolves (auto-detect)", () => {
    root = makeRoot();
    mkdirSync(join(root, "src/styles"), { recursive: true });
    writeFileSync(join(root, "src/styles/globals.css"), "/* x */", "utf8");

    const style = resolveCanvasStyleConfig(root, undefined, undefined);
    if (style.cssPaths.length === 0) warnNoCssResolved();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("does not warn when at least one path resolves (explicit single string)", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const style = resolveCanvasStyleConfig(root, "any/path.css", undefined);
    if (style.cssPaths.length === 0) warnNoCssResolved();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("does not warn when an array with at least one entry is configured", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const style = resolveCanvasStyleConfig(root, ["a.css"], undefined);
    if (style.cssPaths.length === 0) warnNoCssResolved();

    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("warns when configured array is empty", () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    const style = resolveCanvasStyleConfig(root, [], undefined);
    if (style.cssPaths.length === 0) warnNoCssResolved();

    expect(writeSpy).toHaveBeenCalledTimes(1);
  });

  it("warns end-to-end when user config sets styles to an empty string (no /@fs/<root> link)", async () => {
    // Boundary test: a blank-string `styles: ""` in user config should
    // normalize to `[]` (configured-but-empty) and route through the
    // warn-once branch — not produce a `<link href="/@fs/<root>">` that
    // 404s. Threads `loadDeloopConfig` -> `resolveCanvasStyleConfig` to
    // exercise the full path.
    root = makeRoot();
    mkdirSync(join(root, ".deloop"), { recursive: true });
    writeFileSync(join(root, ".deloop/config.ts"), `export default { styles: "" };\n`, "utf8");

    const config = await loadDeloopConfig(root);
    const style = resolveCanvasStyleConfig(root, config?.styles, config?.componentsDir);
    if (style.cssPaths.length === 0) warnNoCssResolved();

    expect(style.cssPaths).toEqual([]);
    expect(writeSpy).toHaveBeenCalledTimes(1);
  });
});

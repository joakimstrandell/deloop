import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverComponents } from "./component-discovery.js";

function makeProject(files: Record<string, string>): string {
  const root = join(tmpdir(), `deloop-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  for (const [file, contents] of Object.entries(files)) {
    const full = join(root, file);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, contents);
  }
  return root;
}

let root: string;

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("discoverComponents — strict shim-only (default)", () => {
  it("scans only *.deloop.tsx files; bare .tsx is ignored", async () => {
    root = makeProject({
      "src/components/button.tsx": "export function Button(){ return null; }",
      "src/components/button.deloop.tsx": "export function Button(){ return null; }",
      "src/components/card.tsx": "export function Card(){ return null; }",
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Button"]);
    expect(result[0]?.relativePath).toBe("src/components/button.deloop.tsx");
  });

  it("emits one ComponentInfo per named export of a shim", async () => {
    root = makeProject({
      "src/components/button.deloop.tsx": `
        export function Button(){ return null; }
        export function ButtonGhost(){ return null; }
        export const ButtonOutline = () => null;
      `,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name).sort()).toEqual(["Button", "ButtonGhost", "ButtonOutline"]);
    // All entries point at the same shim file.
    const paths = new Set(result.map((c) => c.path));
    expect(paths.size).toBe(1);
  });

  it("preserves verbatim casing of the export identifier", async () => {
    root = makeProject({
      "src/components/widget.deloop.tsx": `
        export function MyWidget(){ return null; }
        export function widgetSmall(){ return null; }
      `,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name).sort()).toEqual(["MyWidget", "widgetSmall"]);
  });

  it("yields zero entries for an empty shim with no named exports", async () => {
    root = makeProject({
      "src/components/empty.deloop.tsx": ``,
    });
    const result = await discoverComponents(root);
    expect(result).toEqual([]);
  });

  it("yields zero entries for a shim with only a default export", async () => {
    root = makeProject({
      "src/components/only-default.deloop.tsx": `export default function X(){ return null; }`,
    });
    const result = await discoverComponents(root);
    expect(result).toEqual([]);
  });

  it("ignores default exports while keeping named exports", async () => {
    root = makeProject({
      "src/components/mixed.deloop.tsx": `
        export default function Hidden(){ return null; }
        export function Visible(){ return null; }
      `,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Visible"]);
  });

  it("counts named re-exports (export { X } from './y')", async () => {
    root = makeProject({
      "src/components/inner.tsx": "export function Inner(){ return null; }",
      "src/components/wrap.deloop.tsx": `export { Inner } from "./inner";`,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Inner"]);
    expect(result[0]?.relativePath).toBe("src/components/wrap.deloop.tsx");
  });

  it("uses the renamed export for `export { X as Y }`", async () => {
    root = makeProject({
      "src/components/inner.tsx": "export function Original(){ return null; }",
      "src/components/wrap.deloop.tsx": `export { Original as Renamed } from "./inner";`,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Renamed"]);
  });

  it("supports shims in a separate folder (no co-location requirement)", async () => {
    root = makeProject({
      "src/components/button.tsx": "export function Button(){ return null; }",
      "src/deloop/button.deloop.tsx": `
        // Note: explicit-glob default doesn't reach src/deloop, so we config
        // it via the components option below.
        export function Button(){ return null; }
      `,
    });
    const result = await discoverComponents(root, { components: ["src/deloop"] });
    expect(result.map((c) => c.name)).toEqual(["Button"]);
    expect(result[0]?.relativePath).toBe("src/deloop/button.deloop.tsx");
  });

  it("excludes test/spec/story files even with .deloop.tsx siblings", async () => {
    root = makeProject({
      "src/components/button.deloop.tsx": "export function Button(){ return null; }",
      "src/components/button.test.tsx": "export function Test(){ return null; }",
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Button"]);
  });

  it("ignores 'export type { ... }' declarations", async () => {
    // Type-only exports disappear at runtime, so surfacing them as sidebar
    // entries would produce unrenderable components (the iframe resolver
    // would throw "no named export"). They must be filtered out.
    root = makeProject({
      "src/components/typed.deloop.tsx": `export type { ButtonProps } from "./button";\nexport function Real() { return null; }\n`,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Real"]);
  });

  it("ignores 'type' specifiers within a mixed 'export { ... }'", async () => {
    root = makeProject({
      "src/components/mixed.deloop.tsx": `export { type Bar, Baz } from "./other";\n`,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Baz"]);
  });

  it("dedupes identical export identifiers within a single shim", async () => {
    // Malformed but should not crash. TypeScript would error at typecheck
    // time, but discovery must remain robust on user input.
    root = makeProject({
      "src/components/dup.deloop.tsx": `
        export function X(){ return null; }
        export const X = () => null;
      `,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["X"]);
  });

  it("sorts by (relativePath, name) ascending", async () => {
    root = makeProject({
      "src/components/b.deloop.tsx": `
        export const B2 = () => null;
        export const B1 = () => null;
      `,
      "src/components/a.deloop.tsx": `export const A = () => null;`,
    });
    const result = await discoverComponents(root);
    expect(result.map((c) => `${c.relativePath}:${c.name}`)).toEqual([
      "src/components/a.deloop.tsx:A",
      "src/components/b.deloop.tsx:B1",
      "src/components/b.deloop.tsx:B2",
    ]);
  });

  it("returns empty when no shims exist under default sources", async () => {
    root = makeProject({
      "src/components/button.tsx": "export function Button(){ return null; }",
    });
    const result = await discoverComponents(root);
    expect(result).toEqual([]);
  });

  it("sets absolute path on the discovered shim", async () => {
    root = makeProject({
      "src/components/button.deloop.tsx": `export function Button(){ return null; }`,
    });
    const result = await discoverComponents(root);
    expect(result[0]?.path).toBe(join(root, "src/components/button.deloop.tsx"));
  });
});

describe("discoverComponents — config override", () => {
  it("scans configured directories under the shim-only default expansion", async () => {
    root = makeProject({
      "src/components/button.deloop.tsx": "export function Button(){ return null; }",
      "src/widgets/slider.deloop.tsx": "export function Slider(){ return null; }",
      "src/widgets/toggle.deloop.tsx": "export function Toggle(){ return null; }",
    });
    const result = await discoverComponents(root, { components: ["src/widgets"] });
    expect(result.map((c) => c.name).sort()).toEqual(["Slider", "Toggle"]);
  });

  it("supports multiple configured directories", async () => {
    root = makeProject({
      "src/widgets/slider.deloop.tsx": "export function Slider(){ return null; }",
      "src/forms/input.deloop.tsx": "export function Input(){ return null; }",
      "src/components/other.deloop.tsx": "export function Other(){ return null; }",
    });
    const result = await discoverComponents(root, {
      components: ["src/widgets", "src/forms"],
    });
    expect(result.map((c) => c.name).sort()).toEqual(["Input", "Slider"]);
  });

  it("explicit globs are passed through verbatim — opts back into bare-file scanning", async () => {
    // The escape hatch documented in ADR-0005: an explicit glob is honored
    // as-is. A user pointing at `src/widgets/**/*.tsx` opts into bare-file
    // scanning where each file produces one entry under its filename.
    root = makeProject({
      "src/widgets/slider.tsx": "export function Slider(){ return null; }",
      "src/widgets/nested/toggle.tsx": "export function Toggle(){ return null; }",
    });
    const result = await discoverComponents(root, {
      components: ["src/widgets/**/*.tsx"],
    });
    expect(result.map((c) => c.name).sort()).toEqual(["slider", "toggle"]);
  });

  it("falls back to the default when components is undefined", async () => {
    root = makeProject({
      "src/components/button.deloop.tsx": "export function Button(){ return null; }",
    });
    const result = await discoverComponents(root, {});
    expect(result.map((c) => c.name)).toEqual(["Button"]);
  });

  it("returns empty when components override is an empty array", async () => {
    root = makeProject({
      "src/components/button.deloop.tsx": "export function Button(){ return null; }",
    });
    const result = await discoverComponents(root, { components: [] });
    expect(result).toEqual([]);
  });
});

describe("discoverComponents — explicit-glob bare-file path", () => {
  // The bare-file path is a documented opt-out for users who explicitly
  // glob non-shim `.tsx` files. Barrel detection is retained there so an
  // `index.tsx` re-export file doesn't pollute the sidebar.
  it("filters barrel index.tsx when scanned via an explicit glob", async () => {
    root = makeProject({
      "src/components/button.tsx": "export default function Button(){ return null; }",
      "src/components/index.tsx": `export { default as Button } from "./button";\n`,
    });
    const result = await discoverComponents(root, {
      components: ["src/components/**/*.tsx"],
    });
    expect(result.map((c) => c.name).sort()).toEqual(["button"]);
  });

  it("derives bare-file name from the parent directory for index.tsx", async () => {
    root = makeProject({
      "src/components/Button/index.tsx": "export default function Button(){ return null; }\n",
    });
    const result = await discoverComponents(root, {
      components: ["src/components/**/*.tsx"],
    });
    expect(result.map((c) => c.name)).toEqual(["Button"]);
  });
});

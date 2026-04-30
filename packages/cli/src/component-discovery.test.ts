import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { discoverComponents } from "./component-discovery.js";

function makeProject(files: Record<string, string> | string[]): string {
  const root = join(tmpdir(), `deloop-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const entries: Array<[string, string]> = Array.isArray(files)
    ? files.map((f) => [f, ""])
    : Object.entries(files);
  for (const [file, contents] of entries) {
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

describe("discoverComponents", () => {
  it("returns component files under src/components", async () => {
    root = makeProject(["src/components/Button.tsx", "src/components/Card.tsx"]);
    const result = await discoverComponents(root);
    const names = result.map((c) => c.name).sort();
    expect(names).toEqual(["Button", "Card"]);
  });

  it("excludes test files", async () => {
    root = makeProject([
      "src/components/Button.tsx",
      "src/components/Button.test.tsx",
      "src/components/Button.spec.tsx",
    ]);
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Button"]);
  });

  it("excludes story files", async () => {
    root = makeProject([
      "src/components/Button.tsx",
      "src/components/Button.stories.tsx",
      "src/components/Button.story.tsx",
    ]);
    const result = await discoverComponents(root);
    expect(result.map((c) => c.name)).toEqual(["Button"]);
  });

  it("returns empty array when no components exist", async () => {
    root = makeProject([]);
    const result = await discoverComponents(root);
    expect(result).toEqual([]);
  });

  it("sets relativePath relative to projectRoot", async () => {
    root = makeProject(["src/components/sub/Icon.tsx"]);
    const result = await discoverComponents(root);
    expect(result[0]?.relativePath).toBe("src/components/sub/Icon.tsx");
  });

  it("sets absolute path", async () => {
    root = makeProject(["src/components/Button.tsx"]);
    const result = await discoverComponents(root);
    expect(result[0]?.path).toBe(join(root, "src/components/Button.tsx"));
  });

  describe("config override", () => {
    it("scans configured directories instead of the default", async () => {
      root = makeProject([
        "src/components/Button.tsx",
        "src/widgets/Slider.tsx",
        "src/widgets/Toggle.tsx",
      ]);
      const result = await discoverComponents(root, { components: ["src/widgets"] });
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(["Slider", "Toggle"]);
    });

    it("supports multiple configured directories", async () => {
      root = makeProject([
        "src/widgets/Slider.tsx",
        "src/forms/Input.tsx",
        "src/components/Other.tsx",
      ]);
      const result = await discoverComponents(root, {
        components: ["src/widgets", "src/forms"],
      });
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(["Input", "Slider"]);
    });

    it("supports explicit glob patterns", async () => {
      root = makeProject([
        "src/widgets/Slider.tsx",
        "src/widgets/nested/Toggle.tsx",
        "src/forms/Input.tsx",
      ]);
      const result = await discoverComponents(root, {
        components: ["src/widgets/**/*.tsx"],
      });
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(["Slider", "Toggle"]);
    });

    it("falls back to the default when components is undefined", async () => {
      root = makeProject(["src/components/Button.tsx"]);
      const result = await discoverComponents(root, {});
      expect(result.map((c) => c.name)).toEqual(["Button"]);
    });

    it("returns empty when components override is an empty array", async () => {
      root = makeProject(["src/components/Button.tsx"]);
      const result = await discoverComponents(root, { components: [] });
      expect(result).toEqual([]);
    });
  });

  describe("barrel/re-export handling", () => {
    it("excludes index.tsx that only re-exports siblings", async () => {
      root = makeProject({
        "src/components/Button.tsx": "export default function Button(){ return null; }",
        "src/components/index.tsx": `export { default as Button } from "./Button";\n`,
      });
      const result = await discoverComponents(root);
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(["Button"]);
    });

    it("includes a non-barrel file that happens to be named index", async () => {
      root = makeProject({
        "src/components/Button/index.tsx": "export default function Button(){ return null; }\n",
      });
      const result = await discoverComponents(root);
      // The directory-named index file is a real component; we still want it
      // and its name should reflect its parent directory rather than literally "index".
      const names = result.map((c) => c.name);
      expect(names).toEqual(["Button"]);
    });

    it("excludes namespace re-exports (export * as ns from)", async () => {
      root = makeProject({
        "src/components/Button.tsx": "export default function Button(){ return null; }",
        "src/components/index.tsx": `export * as buttons from "./Button";\n`,
      });
      const result = await discoverComponents(root);
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(["Button"]);
    });

    it("excludes multi-line named re-exports", async () => {
      root = makeProject({
        "src/components/Button.tsx": "export default function Button(){ return null; }",
        "src/components/Card.tsx": "export default function Card(){ return null; }",
        "src/components/index.tsx": `export {\n  Button,\n  Card,\n} from "./components";\n`,
      });
      const result = await discoverComponents(root);
      const names = result.map((c) => c.name).sort();
      expect(names).toEqual(["Button", "Card"]);
    });
  });

  describe("forwardRef wrappers", () => {
    it("registers a forwardRef default export under the filename", async () => {
      root = makeProject({
        "src/components/Input.tsx": `import { forwardRef } from "react";
export default forwardRef(function Input(_props, _ref){ return null; });
`,
      });
      const result = await discoverComponents(root);
      expect(result.map((c) => c.name)).toEqual(["Input"]);
    });
  });
});

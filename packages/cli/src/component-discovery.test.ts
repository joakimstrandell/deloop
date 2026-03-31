import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { discoverComponents } from "./component-discovery.js";

function makeProject(files: string[]): string {
  const root = join(tmpdir(), `deloop-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  for (const file of files) {
    const full = join(root, file);
    mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
    writeFileSync(full, "");
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
});

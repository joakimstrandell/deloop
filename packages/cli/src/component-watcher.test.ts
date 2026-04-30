import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createComponentRegistry } from "./component-watcher.js";

let root: string;
let cleanup: (() => Promise<void>) | null = null;

function makeRoot(): string {
  return join(tmpdir(), `deloop-watcher-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

afterEach(async () => {
  if (cleanup) {
    await cleanup();
    cleanup = null;
  }
  if (root) rmSync(root, { recursive: true, force: true });
});

async function waitFor<T>(
  predicate: () => Promise<T | null> | T | null,
  { timeout = 3000, interval = 25 }: { timeout?: number; interval?: number } = {},
): Promise<T> {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeout) {
    try {
      const value = await predicate();
      if (value !== null && value !== undefined) return value;
    } catch (e) {
      lastError = e;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  throw lastError ?? new Error("waitFor timed out");
}

describe("createComponentRegistry", () => {
  it("returns the current set of components on first read", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    const components = await registry.list();
    expect(components.map((c) => c.name)).toEqual(["Button"]);
  });

  it("re-discovers components when a new file is added", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    expect((await registry.list()).map((c) => c.name)).toEqual(["Button"]);

    writeFileSync(
      join(root, "src/components/Card.tsx"),
      "export default function Card(){ return null; }",
    );

    const list = await waitFor(async () => {
      const items = await registry.list();
      return items.length === 2 ? items : null;
    });
    expect(list.map((c) => c.name).sort()).toEqual(["Button", "Card"]);
  });

  it("re-discovers components when a file is removed", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );
    writeFileSync(
      join(root, "src/components/Card.tsx"),
      "export default function Card(){ return null; }",
    );

    const registry = await createComponentRegistry(root);
    cleanup = () => registry.close();

    expect((await registry.list()).length).toBe(2);

    unlinkSync(join(root, "src/components/Card.tsx"));

    const list = await waitFor(async () => {
      const items = await registry.list();
      return items.length === 1 ? items : null;
    });
    expect(list.map((c) => c.name)).toEqual(["Button"]);
  });

  it("respects the components config override", async () => {
    root = makeRoot();
    mkdirSync(join(root, "src/widgets"), { recursive: true });
    mkdirSync(join(root, "src/components"), { recursive: true });
    writeFileSync(
      join(root, "src/widgets/Slider.tsx"),
      "export default function Slider(){ return null; }",
    );
    writeFileSync(
      join(root, "src/components/Button.tsx"),
      "export default function Button(){ return null; }",
    );

    const registry = await createComponentRegistry(root, { components: ["src/widgets"] });
    cleanup = () => registry.close();

    const components = await registry.list();
    expect(components.map((c) => c.name)).toEqual(["Slider"]);
  });
});

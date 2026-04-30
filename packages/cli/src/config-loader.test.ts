import { describe, it, expect, afterEach } from "vitest";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadDeloopConfig } from "./config-loader.js";

let root: string;

function makeRoot(): string {
  return join(tmpdir(), `deloop-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("loadDeloopConfig", () => {
  it("returns null when .deloop/config.ts is missing", async () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });
    const result = await loadDeloopConfig(root);
    expect(result).toBeNull();
  });

  it("returns the default export of .deloop/config.ts", async () => {
    root = makeRoot();
    mkdirSync(join(root, ".deloop"), { recursive: true });
    writeFileSync(
      join(root, ".deloop/config.ts"),
      `export default { components: ["src/widgets"] };\n`,
      "utf8",
    );

    const result = await loadDeloopConfig(root);

    expect(result).toEqual({ components: ["src/widgets"] });
  });

  it("returns an empty object when the config has no fields", async () => {
    root = makeRoot();
    mkdirSync(join(root, ".deloop"), { recursive: true });
    writeFileSync(join(root, ".deloop/config.ts"), `export default {};\n`, "utf8");

    const result = await loadDeloopConfig(root);

    expect(result).toEqual({});
  });

  it("supports multiple component dirs", async () => {
    root = makeRoot();
    mkdirSync(join(root, ".deloop"), { recursive: true });
    writeFileSync(
      join(root, ".deloop/config.ts"),
      `export default { components: ["src/widgets", "src/forms"] };\n`,
      "utf8",
    );

    const result = await loadDeloopConfig(root);

    expect(result?.components).toEqual(["src/widgets", "src/forms"]);
  });
});

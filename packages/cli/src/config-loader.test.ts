import { describe, it, expect, afterEach, vi } from "vitest";
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

  describe("malformed user config", () => {
    it("returns null and warns when the config has a syntax error", async () => {
      root = makeRoot();
      mkdirSync(join(root, ".deloop"), { recursive: true });
      // Truncated object literal — syntactically invalid TypeScript.
      writeFileSync(join(root, ".deloop/config.ts"), `export default {\n`, "utf8");

      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const result = await loadDeloopConfig(root);
        expect(result).toBeNull();
        expect(warn).toHaveBeenCalled();
        const message = warn.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(message).toMatch(/failed to load \.deloop\/config\.ts/);
      } finally {
        warn.mockRestore();
      }
    });

    it("returns null and warns when the config throws at import time", async () => {
      root = makeRoot();
      mkdirSync(join(root, ".deloop"), { recursive: true });
      writeFileSync(
        join(root, ".deloop/config.ts"),
        `throw new Error("boom-from-user-config");\nexport default {};\n`,
        "utf8",
      );

      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const result = await loadDeloopConfig(root);
        expect(result).toBeNull();
        expect(warn).toHaveBeenCalled();
        const message = warn.mock.calls.map((c) => c.join(" ")).join("\n");
        expect(message).toMatch(/boom-from-user-config/);
      } finally {
        warn.mockRestore();
      }
    });
  });
});

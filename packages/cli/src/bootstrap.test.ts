import { describe, it, expect, afterEach } from "vitest";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { bootstrapDeloopDir } from "./bootstrap.js";

let root: string;

function makeRoot(): string {
  return join(tmpdir(), `deloop-bootstrap-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

describe("bootstrapDeloopDir", () => {
  it("creates .deloop/ directory when missing", async () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    await bootstrapDeloopDir(root);

    expect(existsSync(join(root, ".deloop"))).toBe(true);
  });

  it("creates .deloop/config.ts when missing", async () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    await bootstrapDeloopDir(root);

    expect(existsSync(join(root, ".deloop/config.ts"))).toBe(true);
  });

  it("creates .deloop/canvas.json when missing", async () => {
    root = makeRoot();
    mkdirSync(root, { recursive: true });

    await bootstrapDeloopDir(root);

    const canvasPath = join(root, ".deloop/canvas.json");
    expect(existsSync(canvasPath)).toBe(true);
    expect(() => JSON.parse(readFileSync(canvasPath, "utf8"))).not.toThrow();
  });

  it("does not overwrite an existing .deloop/config.ts", async () => {
    root = makeRoot();
    mkdirSync(join(root, ".deloop"), { recursive: true });
    const configPath = join(root, ".deloop/config.ts");
    writeFileSync(configPath, "// user config\nexport default { custom: true };\n");

    await bootstrapDeloopDir(root);

    expect(readFileSync(configPath, "utf8")).toBe(
      "// user config\nexport default { custom: true };\n",
    );
  });

  it("does not overwrite an existing .deloop/canvas.json", async () => {
    root = makeRoot();
    mkdirSync(join(root, ".deloop"), { recursive: true });
    const canvasPath = join(root, ".deloop/canvas.json");
    writeFileSync(canvasPath, '{"existing":true}');

    await bootstrapDeloopDir(root);

    expect(readFileSync(canvasPath, "utf8")).toBe('{"existing":true}');
  });

  it("fills in only the missing files when .deloop/ already exists", async () => {
    root = makeRoot();
    mkdirSync(join(root, ".deloop"), { recursive: true });
    writeFileSync(join(root, ".deloop/config.ts"), "// existing\n");

    await bootstrapDeloopDir(root);

    expect(readFileSync(join(root, ".deloop/config.ts"), "utf8")).toBe("// existing\n");
    expect(existsSync(join(root, ".deloop/canvas.json"))).toBe(true);
  });
});

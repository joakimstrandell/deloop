/**
 * Unit tests for the strict shim-only iframe export resolver (AWK-73).
 *
 * The dynamic `import()` against `/@fs/` URLs is exercised end-to-end in
 * the e2e suite; this file pins the small pure function that decides
 * which member of a loaded module is rendered.
 */
import { describe, it, expect } from "vitest";
import { resolveComponentExport } from "./resolve-component.js";

describe("resolveComponentExport", () => {
  it("returns the named export when present", () => {
    const Button = () => null;
    const mod = { Button } as Record<string, unknown>;
    expect(resolveComponentExport(mod, "Button", "/@fs/abs/button.deloop.tsx")).toBe(Button);
  });

  it("throws a clear error when the named export is missing", () => {
    const mod = {} as Record<string, unknown>;
    expect(() => resolveComponentExport(mod, "Button", "/@fs/abs/button.deloop.tsx")).toThrow(
      /no named export "Button"/,
    );
  });

  it("does NOT fall back to `default` (strict shim-only)", () => {
    const Default = () => null;
    const mod = { default: Default } as Record<string, unknown>;
    expect(() => resolveComponentExport(mod, "Button", "/@fs/abs/button.deloop.tsx")).toThrow(
      /no named export "Button"/,
    );
  });

  it("accepts forwardRef-style object exports (object with $$typeof)", () => {
    // forwardRef / memo / lazy return objects, not functions. The resolver
    // must accept either shape.
    const fwd = { $$typeof: Symbol.for("react.forward_ref"), render: () => null };
    const mod = { Input: fwd } as Record<string, unknown>;
    expect(resolveComponentExport(mod, "Input", "/@fs/abs/input.deloop.tsx")).toBe(fwd);
  });

  it("rejects non-renderable export shapes (string)", () => {
    const mod = { Bogus: "not-a-component" } as Record<string, unknown>;
    expect(() => resolveComponentExport(mod, "Bogus", "/@fs/abs/x.deloop.tsx")).toThrow(
      /no named export "Bogus"/,
    );
  });

  it("rejects null export", () => {
    const mod = { Nullish: null } as Record<string, unknown>;
    expect(() => resolveComponentExport(mod, "Nullish", "/@fs/abs/x.deloop.tsx")).toThrow(
      /no named export "Nullish"/,
    );
  });

  it("includes the component path in the error message", () => {
    const mod = {} as Record<string, unknown>;
    expect(() => resolveComponentExport(mod, "Missing", "/@fs/abs/path.deloop.tsx")).toThrow(
      /\/@fs\/abs\/path\.deloop\.tsx/,
    );
  });
});

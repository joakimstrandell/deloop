/**
 * Unit tests for the iframe-side drop-payload parser (AWK-14).
 *
 * The native `drop` event hands the iframe a `DataTransfer` whose contents
 * came from the shell's `setComponentDragPayload`. These tests cover the
 * adversarial shapes a `drop` handler can land in — missing MIME, malformed
 * JSON, wrong field types, empty strings — and confirm the parser returns
 * `null` for anything that isn't a complete `ComponentInfo`.
 *
 * Stubbed `DataTransfer` rather than constructing a real one: jsdom's
 * `DataTransfer` exists but with browser-vendor inconsistencies that have
 * nothing to do with the protocol contract. The parser only depends on
 * `getData(format)`, which is the only method we stub.
 */
import { describe, it, expect } from "vitest";
import { COMPONENT_DRAG_MIME } from "../component-drag.js";
import { parseComponentDrop } from "./canvas-drop.js";

function stubDataTransfer(entries: Record<string, string>) {
  return {
    getData(format: string): string {
      return entries[format] ?? "";
    },
  };
}

describe("parseComponentDrop", () => {
  const wellFormed = {
    name: "Button",
    path: "/abs/path/to/button.deloop.tsx",
    relativePath: "src/components/button.deloop.tsx",
  };

  it("accepts a well-formed payload", () => {
    const dt = stubDataTransfer({ [COMPONENT_DRAG_MIME]: JSON.stringify(wellFormed) });
    expect(parseComponentDrop(dt)).toEqual(wellFormed);
  });

  it("returns null when the dataTransfer is null", () => {
    expect(parseComponentDrop(null)).toBeNull();
  });

  it("returns null when the MIME is missing", () => {
    // Simulates a drop whose dataTransfer has, e.g., text/plain only —
    // a non-Deloop drag (file from disk, text selection, etc).
    const dt = stubDataTransfer({ "text/plain": "some text" });
    expect(parseComponentDrop(dt)).toBeNull();
  });

  it("returns null when the payload is not valid JSON", () => {
    const dt = stubDataTransfer({ [COMPONENT_DRAG_MIME]: "not json {[" });
    expect(parseComponentDrop(dt)).toBeNull();
  });

  it("returns null when the payload is JSON but not an object", () => {
    expect(
      parseComponentDrop(stubDataTransfer({ [COMPONENT_DRAG_MIME]: '"a string"' })),
    ).toBeNull();
    expect(parseComponentDrop(stubDataTransfer({ [COMPONENT_DRAG_MIME]: "null" }))).toBeNull();
    expect(parseComponentDrop(stubDataTransfer({ [COMPONENT_DRAG_MIME]: "42" }))).toBeNull();
    expect(parseComponentDrop(stubDataTransfer({ [COMPONENT_DRAG_MIME]: "[1,2]" }))).toBeNull();
  });

  it("returns null when required fields are missing", () => {
    const cases = [
      { path: "/x", relativePath: "src/x.tsx" }, // no name
      { name: "Button", relativePath: "src/x.tsx" }, // no path
      { name: "Button", path: "/x" }, // no relativePath
      {}, // empty
    ];
    for (const partial of cases) {
      const dt = stubDataTransfer({ [COMPONENT_DRAG_MIME]: JSON.stringify(partial) });
      expect(parseComponentDrop(dt)).toBeNull();
    }
  });

  it("returns null when fields are the wrong type", () => {
    const cases = [
      { name: 42, path: "/x", relativePath: "src/x.tsx" },
      { name: "Button", path: 42, relativePath: "src/x.tsx" },
      { name: "Button", path: "/x", relativePath: false },
    ];
    for (const bogus of cases) {
      const dt = stubDataTransfer({ [COMPONENT_DRAG_MIME]: JSON.stringify(bogus) });
      expect(parseComponentDrop(dt)).toBeNull();
    }
  });

  it("returns null when fields are empty strings", () => {
    // Shim discovery never produces empty identifiers, so an empty string
    // is corrupt input. Treat as malformed.
    const cases = [
      { name: "", path: "/x", relativePath: "src/x.tsx" },
      { name: "Button", path: "", relativePath: "src/x.tsx" },
      { name: "Button", path: "/x", relativePath: "" },
    ];
    for (const bogus of cases) {
      const dt = stubDataTransfer({ [COMPONENT_DRAG_MIME]: JSON.stringify(bogus) });
      expect(parseComponentDrop(dt)).toBeNull();
    }
  });

  it("ignores extra fields without rejecting", () => {
    // Forward-compat: future versions may add fields — current parser
    // should round-trip the four it knows about and ignore the rest.
    const withExtras = { ...wellFormed, kind: "leaf", version: 2 };
    const dt = stubDataTransfer({ [COMPONENT_DRAG_MIME]: JSON.stringify(withExtras) });
    expect(parseComponentDrop(dt)).toEqual(wellFormed);
  });
});

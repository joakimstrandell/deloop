/**
 * Unit tests for the postMessage protocol validators (AWK-10).
 *
 * Both directions of the bus accept arbitrary `MessageEvent.data`. We must
 * validate at runtime before trusting a payload because:
 *   - cross-origin junk can land on either window
 *   - dev tools, browser extensions, and hot-reload runtimes also use postMessage
 *
 * The parsers turn `unknown` into the discriminated union types from
 * `./types.ts`, returning `null` for anything malformed.
 */
import { describe, it, expect } from "vitest";
import { parseShellToIframeMessage, parseIframeToShellMessage } from "./protocol.js";

describe("parseShellToIframeMessage", () => {
  it("accepts a well-formed mount message with x,y coordinates", () => {
    const msg = {
      type: "mount",
      cardId: "card-1",
      componentPath: "/@fs/abs/Button.tsx",
      componentName: "Button",
      props: { label: "Hello" },
      x: 120,
      y: 240,
    };
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("accepts a mount message at the origin (0,0)", () => {
    // Zero is a valid coordinate — the canvas origin.
    const msg = {
      type: "mount",
      cardId: "card-1",
      componentPath: "/@fs/abs/Button.tsx",
      componentName: "Button",
      props: {},
      x: 0,
      y: 0,
    };
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("accepts a mount message with negative coordinates", () => {
    // No clamping per AWK-14 locked scope — negative values are valid
    // (e.g., a card panned off-screen and reanchored beyond the origin).
    const msg = {
      type: "mount",
      cardId: "card-1",
      componentPath: "/@fs/abs/Button.tsx",
      componentName: "Button",
      props: {},
      x: -50,
      y: -30,
    };
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("rejects mount missing x or y", () => {
    const base = {
      type: "mount",
      cardId: "card-1",
      componentPath: "/@fs/abs/Button.tsx",
      componentName: "Button",
      props: {},
    };
    expect(parseShellToIframeMessage({ ...base, y: 0 })).toBeNull();
    expect(parseShellToIframeMessage({ ...base, x: 0 })).toBeNull();
    expect(parseShellToIframeMessage(base)).toBeNull();
  });

  it("rejects mount when x or y is non-numeric", () => {
    const base = {
      type: "mount",
      cardId: "card-1",
      componentPath: "/@fs/abs/Button.tsx",
      componentName: "Button",
      props: {},
    };
    expect(parseShellToIframeMessage({ ...base, x: "10", y: 20 })).toBeNull();
    expect(parseShellToIframeMessage({ ...base, x: 10, y: null })).toBeNull();
    expect(parseShellToIframeMessage({ ...base, x: NaN, y: 20 })).toBeNull();
    expect(parseShellToIframeMessage({ ...base, x: Infinity, y: 20 })).toBeNull();
  });

  it("accepts unmount", () => {
    const msg = { type: "unmount", cardId: "card-1" };
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("accepts updateProps", () => {
    const msg = { type: "updateProps", cardId: "card-1", props: { label: "Hi" } };
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("accepts setPseudoState", () => {
    const msg = { type: "setPseudoState", cardId: "card-1", state: "hover" } as const;
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("rejects null and primitives", () => {
    expect(parseShellToIframeMessage(null)).toBeNull();
    expect(parseShellToIframeMessage(42)).toBeNull();
    expect(parseShellToIframeMessage("mount")).toBeNull();
  });

  it("rejects unknown message types", () => {
    expect(parseShellToIframeMessage({ type: "explode" })).toBeNull();
  });

  it("rejects mount missing required fields", () => {
    expect(parseShellToIframeMessage({ type: "mount", cardId: "x" })).toBeNull();
    expect(
      parseShellToIframeMessage({
        type: "mount",
        componentPath: "/x",
        componentName: "Button",
        props: {},
        x: 0,
        y: 0,
      }),
    ).toBeNull();
  });

  it("rejects mount missing componentName", () => {
    expect(
      parseShellToIframeMessage({
        type: "mount",
        cardId: "x",
        componentPath: "/x",
        props: {},
        x: 0,
        y: 0,
      }),
    ).toBeNull();
  });

  it("rejects mount when componentName is the wrong type or empty", () => {
    expect(
      parseShellToIframeMessage({
        type: "mount",
        cardId: "x",
        componentPath: "/x",
        componentName: 42,
        props: {},
        x: 0,
        y: 0,
      }),
    ).toBeNull();
    expect(
      parseShellToIframeMessage({
        type: "mount",
        cardId: "x",
        componentPath: "/x",
        componentName: "",
        props: {},
        x: 0,
        y: 0,
      }),
    ).toBeNull();
  });

  it("rejects iframe→shell messages on the shell→iframe parser", () => {
    expect(parseShellToIframeMessage({ type: "iframeReady" })).toBeNull();
    expect(parseShellToIframeMessage({ type: "cardSelected", cardId: "x" })).toBeNull();
  });

  it("rejects updateProps when props is not an object", () => {
    expect(
      parseShellToIframeMessage({ type: "updateProps", cardId: "x", props: "nope" }),
    ).toBeNull();
  });

  it("rejects mount and updateProps when props is an array", () => {
    expect(
      parseShellToIframeMessage({
        type: "mount",
        cardId: "x",
        componentPath: "/x",
        componentName: "Button",
        props: ["not", "an", "object"],
        x: 0,
        y: 0,
      }),
    ).toBeNull();
    expect(parseShellToIframeMessage({ type: "updateProps", cardId: "x", props: [] })).toBeNull();
  });

  it("rejects setPseudoState with an unsupported state", () => {
    expect(
      parseShellToIframeMessage({ type: "setPseudoState", cardId: "x", state: "exploding" }),
    ).toBeNull();
  });

  it("accepts setColorScheme with light", () => {
    const msg = { type: "setColorScheme", scheme: "light" } as const;
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("accepts setColorScheme with dark", () => {
    const msg = { type: "setColorScheme", scheme: "dark" } as const;
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
  });

  it("rejects setColorScheme with an unsupported scheme literal", () => {
    // The wire only ever carries resolved schemes — never `"system"`.
    // The shell resolves `system` against `prefers-color-scheme` before
    // posting, so the iframe's parser must reject it as malformed.
    expect(parseShellToIframeMessage({ type: "setColorScheme", scheme: "system" })).toBeNull();
    expect(parseShellToIframeMessage({ type: "setColorScheme", scheme: "" })).toBeNull();
    expect(parseShellToIframeMessage({ type: "setColorScheme", scheme: 42 })).toBeNull();
    expect(parseShellToIframeMessage({ type: "setColorScheme" })).toBeNull();
  });
});

describe("parseIframeToShellMessage", () => {
  it("accepts iframeReady", () => {
    expect(parseIframeToShellMessage({ type: "iframeReady" })).toEqual({ type: "iframeReady" });
  });

  it("accepts cardSelected", () => {
    const msg = { type: "cardSelected", cardId: "card-1" };
    expect(parseIframeToShellMessage(msg)).toEqual(msg);
  });

  it("accepts cardMoved with x and y numbers", () => {
    const msg = { type: "cardMoved", cardId: "card-1", x: 12, y: 30 };
    expect(parseIframeToShellMessage(msg)).toEqual(msg);
  });

  it("rejects cardMoved with non-numeric coordinates", () => {
    expect(parseIframeToShellMessage({ type: "cardMoved", cardId: "c", x: "1", y: 2 })).toBeNull();
  });

  it("rejects shell→iframe messages on the iframe→shell parser", () => {
    expect(parseIframeToShellMessage({ type: "mount", cardId: "x" })).toBeNull();
    expect(parseIframeToShellMessage({ type: "unmount", cardId: "x" })).toBeNull();
  });

  it("rejects null and unknown shapes", () => {
    expect(parseIframeToShellMessage(null)).toBeNull();
    expect(parseIframeToShellMessage({ type: "boom" })).toBeNull();
  });

  it("accepts a well-formed componentDropped message", () => {
    const msg = {
      type: "componentDropped",
      component: {
        name: "Button",
        path: "/abs/path/to/button.deloop.tsx",
        relativePath: "src/components/button.deloop.tsx",
      },
      x: 100,
      y: 200,
    };
    expect(parseIframeToShellMessage(msg)).toEqual(msg);
  });

  it("rejects componentDropped when component is malformed", () => {
    const baseDrop = {
      type: "componentDropped",
      x: 0,
      y: 0,
    };
    // Missing fields.
    expect(parseIframeToShellMessage({ ...baseDrop, component: {} })).toBeNull();
    expect(parseIframeToShellMessage({ ...baseDrop, component: { name: "Button" } })).toBeNull();
    // Wrong field types.
    expect(
      parseIframeToShellMessage({
        ...baseDrop,
        component: { name: 42, path: "/x", relativePath: "x" },
      }),
    ).toBeNull();
    // Empty strings — shim discovery never produces empty identifiers.
    expect(
      parseIframeToShellMessage({
        ...baseDrop,
        component: { name: "", path: "/x", relativePath: "x" },
      }),
    ).toBeNull();
    // Component not an object.
    expect(parseIframeToShellMessage({ ...baseDrop, component: null })).toBeNull();
  });

  it("rejects componentDropped with non-numeric coordinates", () => {
    const component = { name: "Button", path: "/abs", relativePath: "src/x.tsx" };
    expect(
      parseIframeToShellMessage({ type: "componentDropped", component, x: "10", y: 20 }),
    ).toBeNull();
    expect(
      parseIframeToShellMessage({ type: "componentDropped", component, x: 10, y: NaN }),
    ).toBeNull();
    expect(parseIframeToShellMessage({ type: "componentDropped", component })).toBeNull();
  });
});

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
  it("accepts a well-formed mount message", () => {
    const msg = {
      type: "mount",
      cardId: "card-1",
      componentPath: "/@fs/abs/Button.tsx",
      props: { label: "Hello" },
    };
    expect(parseShellToIframeMessage(msg)).toEqual(msg);
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
    expect(parseShellToIframeMessage({ type: "mount", componentPath: "/x", props: {} })).toBeNull();
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

  it("rejects setPseudoState with an unsupported state", () => {
    expect(
      parseShellToIframeMessage({ type: "setPseudoState", cardId: "x", state: "exploding" }),
    ).toBeNull();
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
});

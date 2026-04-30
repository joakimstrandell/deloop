/**
 * Runtime validators for the shell ↔ iframe postMessage protocol (AWK-10).
 *
 * `MessageEvent.data` is `unknown` — anything can land in a `message` handler:
 * dev-tools messages, browser-extension chatter, cross-origin attacks. Both
 * sides of the bus run incoming payloads through these parsers and ignore
 * anything that returns `null`.
 *
 * Type definitions live in `./types.ts`; this file is the only place that
 * touches the wire shape at runtime.
 */
import type { IframeToShellMessage, PseudoState, ShellToIframeMessage } from "./types.js";

const PSEUDO_STATES: ReadonlySet<PseudoState> = new Set([
  "default",
  "hover",
  "focus",
  "active",
  "disabled",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainProps(value: unknown): value is Record<string, unknown> {
  // We accept any non-null object as props. Functions/arrays would not survive
  // structured cloning across postMessage anyway, so the runtime already
  // narrows the practical input.
  return isObject(value);
}

export function parseShellToIframeMessage(input: unknown): ShellToIframeMessage | null {
  if (!isObject(input)) return null;

  switch (input["type"]) {
    case "mount": {
      const { cardId, componentPath, props } = input;
      if (typeof cardId === "string" && typeof componentPath === "string" && isPlainProps(props)) {
        return { type: "mount", cardId, componentPath, props };
      }
      return null;
    }
    case "unmount": {
      const { cardId } = input;
      if (typeof cardId === "string") {
        return { type: "unmount", cardId };
      }
      return null;
    }
    case "updateProps": {
      const { cardId, props } = input;
      if (typeof cardId === "string" && isPlainProps(props)) {
        return { type: "updateProps", cardId, props };
      }
      return null;
    }
    case "setPseudoState": {
      const { cardId, state } = input;
      if (
        typeof cardId === "string" &&
        typeof state === "string" &&
        PSEUDO_STATES.has(state as PseudoState)
      ) {
        return { type: "setPseudoState", cardId, state: state as PseudoState };
      }
      return null;
    }
    default:
      return null;
  }
}

export function parseIframeToShellMessage(input: unknown): IframeToShellMessage | null {
  if (!isObject(input)) return null;

  switch (input["type"]) {
    case "iframeReady":
      return { type: "iframeReady" };
    case "cardSelected": {
      const { cardId } = input;
      if (typeof cardId === "string") {
        return { type: "cardSelected", cardId };
      }
      return null;
    }
    case "cardMoved": {
      const { cardId, x, y } = input;
      if (typeof cardId === "string" && typeof x === "number" && typeof y === "number") {
        return { type: "cardMoved", cardId, x, y };
      }
      return null;
    }
    default:
      return null;
  }
}

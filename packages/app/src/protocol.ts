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
import type {
  ColorScheme,
  ComponentInfo,
  IframeToShellMessage,
  PseudoState,
  ShellToIframeMessage,
} from "./types.js";

const PSEUDO_STATES: ReadonlySet<PseudoState> = new Set([
  "default",
  "hover",
  "focus",
  "active",
  "disabled",
]);

const COLOR_SCHEMES: ReadonlySet<ColorScheme> = new Set(["light", "dark"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlainProps(value: unknown): value is Record<string, unknown> {
  // Reject arrays explicitly: `typeof [] === "object"` so isObject lets them
  // through, but a React component's props bag is never an array.
  return isObject(value) && !Array.isArray(value);
}

/**
 * Finite-number guard used for x,y coordinates on the wire.
 *
 * `typeof NaN === "number"` and `typeof Infinity === "number"` so a bare
 * `typeof === "number"` would let nonsense through. Card placement is
 * load-bearing for AWK-14 and these would translate to `NaN`/`Infinity`
 * pixel values, which CSS rejects silently.
 */
function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Validates a `ComponentInfo` payload received over the wire (from the
 * iframe's `componentDropped` message). Mirrors the shim-only discovery
 * shape from `types.ts` — same string fields, no extras.
 */
function isComponentInfo(value: unknown): value is ComponentInfo {
  if (!isObject(value)) return false;
  const { name, path, relativePath } = value;
  return (
    typeof name === "string" &&
    name.length > 0 &&
    typeof path === "string" &&
    path.length > 0 &&
    typeof relativePath === "string" &&
    relativePath.length > 0
  );
}

export function parseShellToIframeMessage(input: unknown): ShellToIframeMessage | null {
  if (!isObject(input)) return null;

  switch (input["type"]) {
    case "mount": {
      const { cardId, componentPath, componentName, props, x, y } = input;
      if (
        typeof cardId === "string" &&
        typeof componentPath === "string" &&
        typeof componentName === "string" &&
        componentName.length > 0 &&
        isPlainProps(props) &&
        isFiniteNumber(x) &&
        isFiniteNumber(y)
      ) {
        return { type: "mount", cardId, componentPath, componentName, props, x, y };
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
    case "setColorScheme": {
      const { scheme } = input;
      if (typeof scheme === "string" && COLOR_SCHEMES.has(scheme as ColorScheme)) {
        return { type: "setColorScheme", scheme: scheme as ColorScheme };
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
      if (typeof cardId === "string" && isFiniteNumber(x) && isFiniteNumber(y)) {
        return { type: "cardMoved", cardId, x, y };
      }
      return null;
    }
    case "componentDropped": {
      const { component, x, y } = input;
      if (isComponentInfo(component) && isFiniteNumber(x) && isFiniteNumber(y)) {
        return { type: "componentDropped", component, x, y };
      }
      return null;
    }
    default:
      return null;
  }
}

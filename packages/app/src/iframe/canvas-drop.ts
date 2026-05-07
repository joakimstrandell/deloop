import { COMPONENT_DRAG_MIME } from "../component-drag.js";
import type { ComponentInfo } from "../types.js";

/**
 * Parses a drag-event `dataTransfer` payload produced by the shell sidebar
 * (`setComponentDragPayload` in `shell/sidebar/ComponentList.tsx`) into a
 * `ComponentInfo`, or returns `null` if the payload is missing or malformed.
 *
 * AWK-14 makes the iframe document the authoritative drop target — the
 * shell never sees the native `drop` event because the user releases the
 * pointer over the canvas iframe, which is a separate browser document.
 * The iframe extracts the payload here and posts `componentDropped` to
 * the shell; the shell mints a `cardId` and replies with `mount` (x,y).
 *
 * Tolerant on the wire (returns `null` on bad shapes), strict on what
 * counts as well-formed: the four-field shim shape from `types.ts` plus
 * a guard against empty strings (which shim discovery never produces).
 *
 * Mirror of `setComponentDragPayload` in the sidebar; tested in isolation
 * because the JSX handler is not directly exercisable without a renderer.
 */

/**
 * Subset of `DataTransfer` we depend on. Tests synthesise minimal stubs
 * that implement just `getData` rather than constructing a real
 * `DataTransfer` (which has surprising browser-vendor differences).
 */
interface DataTransferLike {
  getData(format: string): string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function parseComponentDrop(dataTransfer: DataTransferLike | null): ComponentInfo | null {
  if (!dataTransfer) return null;

  const raw = dataTransfer.getData(COMPONENT_DRAG_MIME);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isObject(parsed)) return null;
  const { name, path, relativePath } = parsed;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    typeof path !== "string" ||
    path.length === 0 ||
    typeof relativePath !== "string" ||
    relativePath.length === 0
  ) {
    return null;
  }

  return { name, path, relativePath };
}

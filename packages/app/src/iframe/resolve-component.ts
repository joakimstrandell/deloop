import type { ComponentType } from "react";

/**
 * Strict shim-only export resolver (ADR-0005).
 *
 * The shell sends a `mount` message whose `componentName` is the verbatim
 * identifier of one of the shim's named exports. The iframe imports the
 * shim module and looks up that export here — there is no default-export
 * fallback. A missing or non-renderable export is a clear error rather
 * than silently mounting something else.
 *
 * Plain function components are functions; React.forwardRef, React.memo,
 * and React.lazy wrap them in objects with a `$$typeof` symbol. Either
 * shape is renderable; anything else (string, number, null, undefined) is
 * not a valid component.
 */
export function resolveComponentExport(
  mod: Record<string, unknown>,
  componentName: string,
  componentPath: string,
): ComponentType<Record<string, unknown>> {
  const Component = mod[componentName];
  if (Component == null || (typeof Component !== "function" && typeof Component !== "object")) {
    throw new Error(`${componentPath} has no named export "${componentName}"`);
  }
  return Component as ComponentType<Record<string, unknown>>;
}

/**
 * Shared color-scheme storage helpers used by both the shell and the
 * iframe (AWK-79).
 *
 * The shell and the canvas iframe live on the same origin (ADR-0001),
 * so localStorage is shared between them. The iframe reads from this
 * key synchronously on cold load to pick its initial scheme without
 * waiting for a postMessage round trip — that's how we avoid a
 * light→dark flicker the first paint after a hard reload.
 *
 * The stored value is the user's `Mode` literal ("light" | "dark" |
 * "system"). Validation on read is essential: localStorage is
 * untrusted (devtools, extensions, prior versions can write garbage).
 *
 * Browser-only by intent. `packages/app` never imports Node APIs, but
 * also never assumes a particular browser context: each consumer
 * (shell vs. iframe) is responsible for calling these only when
 * `window.localStorage` is available. The functions guard internally
 * so they're safe in test setups that stub `window` minimally.
 */
import type { ColorScheme } from "./types.js";

/**
 * The user's preferred mode. `system` defers to `prefers-color-scheme`;
 * the resolved literal is what gets sent to the iframe. The cycle button
 * advances `light → dark → system → light` and shows the icon for the
 * mode literal (Monitor for `system`), not the resolved scheme.
 */
export type ColorSchemeMode = "light" | "dark" | "system";

/** localStorage key — shared verbatim by shell and iframe. */
export const COLOR_SCHEME_STORAGE_KEY = "deloop:color-scheme";

const VALID_MODES: ReadonlySet<ColorSchemeMode> = new Set(["light", "dark", "system"]);

/**
 * Reads the persisted mode from localStorage. Falls back to "system"
 * when the key is missing, when localStorage isn't available, or when
 * the stored value isn't a known mode literal — defensive because the
 * key is plain user-writable storage.
 */
export function readStoredMode(): ColorSchemeMode {
  try {
    const raw = window.localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    if (raw != null && VALID_MODES.has(raw as ColorSchemeMode)) {
      return raw as ColorSchemeMode;
    }
  } catch {
    // localStorage can throw in private mode or with strict policies.
    // A reset to the default is the safe fallback.
  }
  return "system";
}

/**
 * Persists the user's mode preference. Silently no-ops if storage is
 * unavailable — the toggle still works for the rest of the session,
 * it just won't survive a reload. That's strictly better than
 * crashing the shell on an exotic browser configuration.
 */
export function writeStoredMode(mode: ColorSchemeMode): void {
  try {
    window.localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, mode);
  } catch {
    // See readStoredMode() for why we swallow.
  }
}

/**
 * Resolves a `Mode` to the `"light" | "dark"` literal that goes on the
 * wire and on the `<html>` class. `system` consults
 * `prefers-color-scheme` once at the call site; the caller is
 * responsible for re-resolving when the OS preference changes.
 */
export function resolveScheme(mode: ColorSchemeMode): ColorScheme {
  if (mode === "light" || mode === "dark") return mode;
  // `matchMedia` is defined in every browser Deloop targets. The guard
  // is here so this function can be called under jsdom or vitest setups
  // that don't shim it.
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { IframeApp } from "./IframeApp.js";
import { readStoredMode, resolveScheme } from "../color-scheme.js";

/**
 * Synchronous color-scheme bootstrap (AWK-79).
 *
 * The shell ↔ canvas channel is async by definition (postMessage round
 * trip + iframeReady handshake). If we waited for the shell to broadcast
 * the scheme, the iframe would paint in light mode and then flip to dark,
 * producing a visible flash on every cold load when the persisted mode
 * resolves to dark.
 *
 * The fix is to read the user's Mode straight from localStorage —
 * same-origin between shell and iframe per ADR-0001 — and apply
 * `.dark` to `<html>` (plus the chrome's `data-color-scheme` attribute
 * on the body) before React mounts. The shell still owns subsequent
 * changes via `setColorScheme`.
 *
 * This block must run before `createRoot(...).render(...)` so the first
 * paint sees the right tokens.
 */
{
  const mode = readStoredMode();
  const scheme = resolveScheme(mode);
  document.documentElement.classList.toggle("dark", scheme === "dark");
  // The chrome lives in a shadow root (AWK-13). Its CSS targets the
  // host with `:host([data-color-scheme="dark"])`, so the React tree
  // sets the same attribute on the host element on mount. We also set
  // a marker on <html> here so any pre-host paint of the chrome lands
  // in the right scheme; the host attribute is the load-bearing one.
  document.documentElement.dataset["colorScheme"] = scheme;
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found in iframe.html");

createRoot(rootEl).render(
  <StrictMode>
    <IframeApp />
  </StrictMode>,
);

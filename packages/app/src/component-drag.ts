/**
 * Cross-document constant: MIME type used for the sidebar → canvas drag
 * protocol. The shell sets this on `dragstart`; the iframe reads it on
 * `drop`. Lives at the top of `packages/app/src` so neither side has to
 * reach into the other's folder for it (the sidebar lives in `shell/`,
 * the drop target lives in `iframe/`, but both documents are the same
 * SPA so a shared module is the obvious home).
 *
 * The custom MIME means only Deloop-aware drop targets accept the drag
 * — drops onto the user's app or random web pages naturally fall back
 * to the `text/plain` payload (the relative path), which is harmless.
 */
export const COMPONENT_DRAG_MIME = "application/x-deloop-component";

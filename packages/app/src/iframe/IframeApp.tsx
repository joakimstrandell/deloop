import {
  Fragment,
  type ComponentType,
  type ReactNode,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { parseShellToIframeMessage } from "../protocol.js";
import { resolveComponentExport } from "./resolve-component.js";
import type { ColorScheme, IframeToShellMessage, PseudoState } from "../types.js";

interface MountedCard {
  cardId: string;
  /** Vite /@fs/ URL or other module specifier for the component module. */
  componentPath: string;
  /** Export name resolved against the imported module (see MOUNT). */
  componentName: string;
  props: Record<string, unknown>;
  pseudoState: PseudoState;
  Component: ComponentType<Record<string, unknown>> | null;
  error: string | null;
}

type State = Map<string, MountedCard>;

type Action =
  | {
      type: "MOUNT";
      cardId: string;
      componentPath: string;
      componentName: string;
      props: Record<string, unknown>;
    }
  | { type: "RESOLVED"; cardId: string; Component: ComponentType<Record<string, unknown>> }
  | { type: "FAILED"; cardId: string; error: string }
  | { type: "UNMOUNT"; cardId: string }
  | { type: "UPDATE_PROPS"; cardId: string; props: Record<string, unknown> }
  | { type: "SET_PSEUDO_STATE"; cardId: string; state: PseudoState };

function reducer(state: State, action: Action): State {
  const next = new Map(state);
  switch (action.type) {
    case "MOUNT":
      next.set(action.cardId, {
        cardId: action.cardId,
        componentPath: action.componentPath,
        componentName: action.componentName,
        props: action.props,
        pseudoState: "default",
        Component: null,
        error: null,
      });
      return next;
    case "RESOLVED": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, Component: action.Component });
      return next;
    }
    case "FAILED": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, error: action.error });
      return next;
    }
    case "UNMOUNT":
      next.delete(action.cardId);
      return next;
    case "UPDATE_PROPS": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, props: action.props });
      return next;
    }
    case "SET_PSEUDO_STATE": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, pseudoState: action.state });
      return next;
    }
  }
}

function postToShell(msg: IframeToShellMessage) {
  // Same-origin shell ↔ iframe per ADR-0001; pin targetOrigin to the
  // iframe's own origin (which equals the shell's) instead of "*".
  window.parent.postMessage(msg, window.location.origin);
}

/**
 * Inline CSS for Deloop's canvas chrome (grid, card frame, label, error
 * frame). Lives inside an open shadow root attached to the host element
 * so utility classes used here cannot collide with the user's CSS, and
 * the user's CSS cannot leak in to restyle Deloop's frame.
 *
 * The user's project CSS (loaded via `<link>` in <head>) reaches the
 * card's user-component children because they live in light DOM under
 * the host and are projected into named slots.
 *
 * Kept deliberately Tailwind-free — Tailwind utility classes only
 * generate against scanned source files, and shadow-rooted markup is
 * outside the user's `@source` paths.
 */
const CHROME_CSS = `
:host {
  display: block;
  min-height: 100vh;
}
.deloop-grid {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: 1.5rem;
  padding: 1.5rem;
  min-height: 100vh;
  box-sizing: border-box;
}
.deloop-card {
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  background: #ffffff;
  color: #111827;
}
.deloop-card[data-pseudo-state="hover"] {
  border-color: #9ca3af;
}
.deloop-card[data-pseudo-state="active"] {
  border-color: #6b7280;
}
.deloop-card-error {
  border-color: #dc2626;
  color: #dc2626;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  max-width: 28rem;
}
.deloop-card-error-pre {
  margin: 0.5rem 0 0 0;
  white-space: pre-wrap;
}
.deloop-card-label {
  display: block;
  margin-bottom: 0.75rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: #9ca3af;
}
.deloop-card-loading {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.75rem;
  color: #6b7280;
}
/*
 * Chrome dark-mode mirror, gated on the resolved shell scheme (AWK-79).
 *
 * Pre-AWK-79 this block was a prefers-color-scheme media query, which
 * tracked the OS preference directly. The shell now owns the user's
 * Mode (light / dark / system) and broadcasts a resolved scheme; the
 * host element data-color-scheme="dark" attribute is the single source
 * of truth the chrome reacts to. :host([...]) selectors stay inside the
 * shadow tree and never need :host-context() (which Firefox lacks).
 */
:host([data-color-scheme="dark"]) .deloop-card {
  background: #0a0a0a;
  border-color: #262626;
  color: #e5e7eb;
}
:host([data-color-scheme="dark"]) .deloop-card[data-pseudo-state="hover"] {
  border-color: #404040;
}
:host([data-color-scheme="dark"]) .deloop-card[data-pseudo-state="active"] {
  border-color: #525252;
}
:host([data-color-scheme="dark"]) .deloop-card-label,
:host([data-color-scheme="dark"]) .deloop-card-loading {
  color: #737373;
}
`;

/**
 * Reads the cold-load scheme that `main.tsx` stamped onto
 * `document.documentElement` before React mounted. Falls back to
 * `"light"` if the attribute is missing or unrecognised — same defensive
 * stance as `readStoredMode`, since the attribute is observable
 * developer-facing surface.
 */
function readBootstrapScheme(): ColorScheme {
  if (typeof document === "undefined") return "light";
  const stamped = document.documentElement.dataset["colorScheme"];
  return stamped === "dark" ? "dark" : "light";
}

/**
 * Imperatively applies a resolved scheme to the iframe document.
 * Centralised so the cold-load bootstrap and `setColorScheme` handler
 * never drift apart on which surfaces get touched (currently: the
 * `.dark` class on `<html>` for the user component CSS, and the
 * `data-color-scheme` attribute on `<html>` as a backup signal).
 *
 * The shadow host's own attribute is set declaratively in JSX below;
 * this function deliberately stays out of React state to keep the
 * sync-first cold-load path obvious.
 */
function applyScheme(scheme: ColorScheme): void {
  document.documentElement.classList.toggle("dark", scheme === "dark");
  document.documentElement.dataset["colorScheme"] = scheme;
}

export function IframeApp() {
  const [mounted, dispatch] = useReducer(reducer, new Map<string, MountedCard>());
  const [scheme, setScheme] = useState<ColorScheme>(readBootstrapScheme);

  useEffect(() => {
    async function handleMessage(event: MessageEvent<unknown>) {
      // Only accept messages from our parent shell document. Mirrors the
      // shell-side guard at App.tsx and prevents accidental processing of
      // messages from nested iframes, browser extensions, or window openers.
      if (event.source !== window.parent) return;
      const msg = parseShellToIframeMessage(event.data);
      if (!msg) return;

      switch (msg.type) {
        case "mount": {
          dispatch({
            type: "MOUNT",
            cardId: msg.cardId,
            componentPath: msg.componentPath,
            componentName: msg.componentName,
            props: msg.props,
          });
          // Resolve the component module asynchronously. The placeholder
          // card is already on screen via the synchronous MOUNT dispatch.
          try {
            // Vite serves user components via /@fs/ prefix (see ADR-0002).
            // The /* @vite-ignore */ comment suppresses the dynamic import warning.
            const mod = (await import(/* @vite-ignore */ msg.componentPath)) as Record<
              string,
              unknown
            >;
            const Component = resolveComponentExport(mod, msg.componentName, msg.componentPath);
            dispatch({
              type: "RESOLVED",
              cardId: msg.cardId,
              Component: Component as ComponentType<Record<string, unknown>>,
            });
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            dispatch({ type: "FAILED", cardId: msg.cardId, error });
          }
          break;
        }
        case "unmount":
          dispatch({ type: "UNMOUNT", cardId: msg.cardId });
          break;
        case "updateProps":
          dispatch({ type: "UPDATE_PROPS", cardId: msg.cardId, props: msg.props });
          break;
        case "setPseudoState":
          dispatch({ type: "SET_PSEUDO_STATE", cardId: msg.cardId, state: msg.state });
          break;
        case "setColorScheme":
          // Apply imperatively so user component CSS reacts even before
          // the host attribute change has propagated through React's
          // commit; then update state so the host attribute follows.
          applyScheme(msg.scheme);
          setScheme(msg.scheme);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    // Tell the shell the iframe is hydrated and ready to accept messages.
    postToShell({ type: "iframeReady" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <ChromeHost colorScheme={scheme}>
      {(renderChrome) => {
        const cards = Array.from(mounted.values());
        return (
          <>
            {/*
              Chrome JSX — grid, card frames, labels, error frames. Lives
              inside the shadow root via createPortal. References named
              slots; the actual user component renders in light DOM below.
            */}
            {renderChrome(
              <div className="deloop-grid" data-deloop-chrome>
                {cards.map((entry) => (
                  <ChromeCard
                    key={entry.cardId}
                    entry={entry}
                    onSelect={() => postToShell({ type: "cardSelected", cardId: entry.cardId })}
                  />
                ))}
              </div>,
            )}
            {/*
              Light-DOM children of the shadow host. Each one is slotted
              into the matching `<slot name="card-<cardId>">` anchor by
              the browser. User CSS reaches these naturally because they
              live in the document's normal DOM tree.
            */}
            {cards.map((entry) => (
              <Fragment key={entry.cardId}>
                {entry.Component != null && entry.error == null ? (
                  <div slot={`card-${entry.cardId}`}>
                    <entry.Component {...entry.props} />
                  </div>
                ) : null}
              </Fragment>
            ))}
          </>
        );
      }}
    </ChromeHost>
  );
}

/**
 * Renders a host element with an open shadow root and exposes a render
 * function that portals chrome JSX into that shadow root.
 *
 * The host element itself is the parent of:
 *   - A shadow tree containing chrome (grid + card frames + slots).
 *   - Light-DOM child elements with `slot="card-<id>"` that the browser
 *     projects into the matching named slot inside the shadow root.
 *
 * `attachShadow` only succeeds the first time per element; we capture
 * the root in state and tear nothing down on re-render.
 */
function ChromeHost({
  colorScheme,
  children,
}: {
  /**
   * Resolved scheme literal driving the chrome's dark/light selectors
   * via `:host([data-color-scheme="dark"])` inside the shadow tree.
   * The shell owns the `Mode` (light/dark/system); the iframe only
   * ever sees a resolved literal — see ColorScheme in types.ts.
   */
  colorScheme: ColorScheme;
  children: (renderChrome: (chrome: ReactNode) => ReactNode) => ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shadowRoot, setShadowRoot] = useState<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host == null) return;
    if (host.shadowRoot != null) {
      setShadowRoot(host.shadowRoot);
      return;
    }
    const root = host.attachShadow({ mode: "open" });
    // Inline chrome stylesheet — scoped to this shadow tree only.
    const styleEl = document.createElement("style");
    styleEl.dataset["deloopChromeStyles"] = "";
    styleEl.textContent = CHROME_CSS;
    root.appendChild(styleEl);
    setShadowRoot(root);
  }, []);

  function renderChrome(chrome: ReactNode): ReactNode {
    return shadowRoot != null ? createPortal(chrome, shadowRoot) : null;
  }

  return (
    <div ref={hostRef} data-deloop-chrome-host data-color-scheme={colorScheme}>
      {children(renderChrome)}
    </div>
  );
}

function ChromeCard({ entry, onSelect }: { entry: MountedCard; onSelect: () => void }) {
  if (entry.error) {
    return (
      <div
        data-card-id={entry.cardId}
        data-pseudo-state={entry.pseudoState}
        className="deloop-card deloop-card-error"
      >
        <strong>Error loading {entry.cardId}</strong>
        <pre className="deloop-card-error-pre">{entry.error}</pre>
      </div>
    );
  }

  return (
    <div
      data-card-id={entry.cardId}
      data-pseudo-state={entry.pseudoState}
      onClick={onSelect}
      className="deloop-card"
    >
      <div className="deloop-card-label">{entry.cardId}</div>
      {entry.Component ? (
        <slot name={`card-${entry.cardId}`}></slot>
      ) : (
        <div className="deloop-card-loading">Loading {entry.cardId}…</div>
      )}
    </div>
  );
}

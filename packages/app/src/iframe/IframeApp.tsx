import {
  Fragment,
  type ComponentType,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useReducer,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { COMPONENT_DRAG_MIME } from "../component-drag.js";
import { parseShellToIframeMessage } from "../protocol.js";
import { cardReducer, type MountedCard } from "./card-store.js";
import { parseComponentDrop } from "./canvas-drop.js";
import { resolveComponentExport } from "./resolve-component.js";
import type { ColorScheme, IframeToShellMessage } from "../types.js";

function postToShell(msg: IframeToShellMessage) {
  // Same-origin shell ↔ iframe per ADR-0001; pin targetOrigin to the
  // iframe's own origin (which equals the shell's) instead of "*".
  window.parent.postMessage(msg, window.location.origin);
}

/**
 * Inline CSS for Deloop's canvas chrome (free-form canvas, card frame,
 * label, error frame). Lives inside an open shadow root attached to the
 * host element so utility classes used here cannot collide with the
 * user's CSS, and the user's CSS cannot leak in to restyle Deloop's frame.
 *
 * The user's project CSS (loaded via `<link>` in <head>) reaches the
 * card's user-component children because they live in light DOM under
 * the host and are projected into named slots.
 *
 * Layout (AWK-14):
 *   - `.deloop-canvas` is the positioning context (`position: relative`)
 *     and fills the host. Each `.deloop-card` is `position: absolute`
 *     with explicit `left`/`top` set inline from the card's stored x,y.
 *   - The pre-AWK-14 flex grid is gone. Cards anchor at the drop point
 *     and stay there until repositioned. No clamping, no auto-layout.
 *
 * `:host` carries `data-dragging-component` while a sidebar drag is in
 * flight; the cursor-copy hint comes from that. We avoid restyling the
 * `<body>` because the user component's CSS owns the body's appearance.
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
.deloop-canvas {
  position: relative;
  min-height: 100vh;
  box-sizing: border-box;
}
:host([data-dragging-component]) .deloop-canvas {
  cursor: copy;
}
.deloop-card {
  position: absolute;
  border: 1px solid #e5e7eb;
  border-radius: 0.5rem;
  padding: 1rem;
  background: #ffffff;
  color: #111827;
  /* The chrome card is the drag handle for repositioning — make it
     unmistakable that the chrome itself is interactive while the user
     component inside the slot is not. */
  cursor: grab;
  /* Suppress browser-native touch panning while we handle pointer events
     directly. Without this, mobile/touchpads can intercept the move
     stream and the reposition lags or aborts mid-drag. */
  touch-action: none;
  /* Avoid text selection turning the drag into a selection gesture. */
  user-select: none;
}
.deloop-card[data-dragging="true"] {
  cursor: grabbing;
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
 * Re-enable selection inside the user component itself — the no-select
 * rule above is a drag-handle convenience for the chrome frame, not a
 * blanket disable on the user's content.
 */
.deloop-card ::slotted(*) {
  cursor: auto;
  user-select: auto;
  touch-action: auto;
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
  const [mounted, dispatch] = useReducer(cardReducer, new Map<string, MountedCard>());
  const [scheme, setScheme] = useState<ColorScheme>(readBootstrapScheme);
  // Tracks whether a Deloop component drag is currently in flight over
  // the iframe document. Drives the cursor-copy hint via the shadow
  // host's data-attribute. Reset on `dragleave`/`drop`/`dragend`.
  const [dragOver, setDragOver] = useState(false);

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
            x: msg.x,
            y: msg.y,
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

  /*
   * Native drag/drop listeners on the iframe document (AWK-14).
   *
   * We listen at the document level rather than on a specific React
   * element because the chrome host's shadow-root layout means a
   * synthetic React drag handler on a wrapper div would miss drops
   * landing in the gaps between cards. Document-level listeners catch
   * every drop inside the iframe.
   *
   * `dragover.preventDefault()` is required by the HTML5 drag/drop spec
   * to mark an element as a valid drop target — without it the browser
   * suppresses the subsequent `drop` event entirely.
   *
   * The drop coordinate uses iframe-document coordinates: clientX/Y
   * (viewport-relative inside the iframe) plus scrollX/Y (so a card
   * dropped on a scrolled canvas anchors at the document point, not
   * the viewport point). Per locked scope: no clamping, no zoom.
   */
  useEffect(() => {
    function handleDragOver(event: DragEvent) {
      // Only react to drags that carry our component MIME. Other drags
      // (file from disk, text selection, etc) should fall through.
      if (!event.dataTransfer) return;
      const types = event.dataTransfer.types;
      // `types` is a DOMStringList in some browsers, an array in others;
      // `Array.from` normalises both.
      if (!Array.from(types).includes(COMPONENT_DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      if (!dragOver) setDragOver(true);
    }

    function handleDragLeave(event: DragEvent) {
      // Fires when the pointer crosses out of an element OR off the
      // document. Only clear the hint when we've left the document
      // entirely — `relatedTarget` is null in that case.
      if (event.relatedTarget == null) {
        setDragOver(false);
      }
    }

    function handleDrop(event: DragEvent) {
      const component = parseComponentDrop(event.dataTransfer);
      if (!component) {
        // Not a Deloop drag — let the browser handle it (or no-op).
        setDragOver(false);
        return;
      }
      event.preventDefault();
      const x = event.clientX + window.scrollX;
      const y = event.clientY + window.scrollY;
      postToShell({ type: "componentDropped", component, x, y });
      setDragOver(false);
    }

    function handleDragEnd() {
      // Reset the hint when the source aborts the drag (Esc, drop on
      // an invalid target). Iframe doesn't see `dragend` on the source
      // itself, but a stray dragend bubbling up from inside is harmless.
      setDragOver(false);
    }

    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop);
    document.addEventListener("dragend", handleDragEnd);
    return () => {
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop);
      document.removeEventListener("dragend", handleDragEnd);
    };
  }, [dragOver]);

  return (
    <ChromeHost colorScheme={scheme} draggingComponent={dragOver}>
      {(renderChrome) => {
        const cards = Array.from(mounted.values());
        return (
          <>
            {/*
              Chrome JSX — free-form canvas with absolutely-positioned
              card frames, labels, error frames. Lives inside the shadow
              root via createPortal. References named slots; the actual
              user component renders in light DOM below.
            */}
            {renderChrome(
              <div className="deloop-canvas" data-deloop-chrome>
                {cards.map((entry) => (
                  <ChromeCard
                    key={entry.cardId}
                    entry={entry}
                    onSelect={() => postToShell({ type: "cardSelected", cardId: entry.cardId })}
                    onMove={(x, y) =>
                      dispatch({ type: "SET_POSITION", cardId: entry.cardId, x, y })
                    }
                    onMoveEnd={(x, y) =>
                      postToShell({ type: "cardMoved", cardId: entry.cardId, x, y })
                    }
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
 *   - A shadow tree containing chrome (canvas + card frames + slots).
 *   - Light-DOM child elements with `slot="card-<id>"` that the browser
 *     projects into the matching named slot inside the shadow root.
 *
 * `attachShadow` only succeeds the first time per element; we capture
 * the root in state and tear nothing down on re-render.
 */
function ChromeHost({
  colorScheme,
  draggingComponent,
  children,
}: {
  /**
   * Resolved scheme literal driving the chrome's dark/light selectors
   * via `:host([data-color-scheme="dark"])` inside the shadow tree.
   * The shell owns the `Mode` (light/dark/system); the iframe only
   * ever sees a resolved literal — see ColorScheme in types.ts.
   */
  colorScheme: ColorScheme;
  /**
   * `true` while a sidebar component drag is hovering over the iframe
   * document. Surfaces as `data-dragging-component` on the host so the
   * `:host([data-dragging-component])` cursor-copy rule activates.
   */
  draggingComponent: boolean;
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

  // `data-dragging-component` is only present (no value) when a drag is
  // in flight. Boolean attributes drive presence-only selectors more
  // cleanly than truthy values.
  return (
    <div
      ref={hostRef}
      data-deloop-chrome-host
      data-color-scheme={colorScheme}
      {...(draggingComponent ? { "data-dragging-component": "" } : {})}
    >
      {children(renderChrome)}
    </div>
  );
}

interface ChromeCardProps {
  entry: MountedCard;
  onSelect: () => void;
  /** Called repeatedly during a drag — drives the optimistic position update. */
  onMove: (x: number, y: number) => void;
  /** Called once on `pointerup` with the final coords — the wire signal. */
  onMoveEnd: (x: number, y: number) => void;
}

/**
 * The chrome frame around a mounted card. Captures pointer events on
 * itself to drive reposition (AWK-14). Pointer-capture is the right
 * model for dragging: once `setPointerCapture` is called the moves are
 * delivered to this element even if the pointer leaves it, and we don't
 * need a global mousemove listener.
 *
 * Click semantics: a `pointerdown` followed by `pointerup` without
 * meaningful motion is a "select" click; with motion it's a drag. We
 * track a small motion threshold to disambiguate so a precise click on
 * a card doesn't generate a redundant `cardMoved` for the same coords.
 */
function ChromeCard({ entry, onSelect, onMove, onMoveEnd }: ChromeCardProps) {
  // Refs (not state) for drag bookkeeping — reading drag state inside
  // pointermove must be synchronous and re-renders during a drag would
  // thrash. The visible position is driven by `entry.x`/`entry.y` from
  // the reducer state.
  const dragRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (entry.error) return;
    // Only react to the primary button. Right-click, middle-click, etc
    // shouldn't initiate a drag.
    if (event.button !== 0) return;
    // Don't initiate drag if pointerdown happened inside the user
    // component (slotted content). The slot itself receives the event
    // when content is slotted; we only handle drag on the chrome frame.
    // We test by checking if the originalTarget is the chrome card itself
    // or a descendant in the shadow tree. The `composedPath` approach
    // would also work, but checking `currentTarget === target` is simpler
    // — slotted user content has the slot in its composed path, not the
    // chrome card div.
    const target = event.target as Node;
    const card = event.currentTarget;
    // If the event originated from a slotted user element, `target` is
    // the user element (in light DOM); `card.contains` returns false
    // because the slot projection is render-only — the actual node lives
    // outside the shadow tree. Bail in that case so clicks inside the
    // user component don't initiate a card drag.
    if (!card.contains(target)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: entry.x,
      startY: entry.y,
      moved: false,
    };
    setDragging(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
      drag.moved = true;
    }
    if (drag.moved) {
      onMove(drag.startX + dx, drag.startY + dy);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // releasePointerCapture throws if the pointer is no longer
      // captured (e.g., the browser cancelled the capture). Safe to
      // ignore — we're done with it either way.
    }
    if (drag.moved) {
      const finalX = drag.startX + (event.clientX - drag.startClientX);
      const finalY = drag.startY + (event.clientY - drag.startClientY);
      // Single shell-bound message at end of drag, not per-frame, per
      // the locked scope. The optimistic onMove already drove the local
      // visible position during the drag.
      onMoveEnd(finalX, finalY);
    } else {
      // Treat a no-motion pointerup as a select click.
      onSelect();
    }
    dragRef.current = null;
    setDragging(false);
  }

  function handlePointerCancel(_event: ReactPointerEvent<HTMLDivElement>): void {
    // Browser yanked pointer capture (e.g., higher-priority gesture).
    // Reset state without emitting a position — the cardMoved message
    // would be a lie because the user didn't intentionally end the drag.
    dragRef.current = null;
    setDragging(false);
  }

  if (entry.error) {
    return (
      <div
        data-card-id={entry.cardId}
        data-pseudo-state={entry.pseudoState}
        className="deloop-card deloop-card-error"
        style={{ left: `${entry.x}px`, top: `${entry.y}px` }}
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
      data-dragging={dragging ? "true" : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className="deloop-card"
      style={{ left: `${entry.x}px`, top: `${entry.y}px` }}
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

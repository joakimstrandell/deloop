import { useCallback, useEffect, useRef, useState } from "react";
import { ComponentList } from "./sidebar/ComponentList.js";
import { ColorSchemeToggle } from "./ColorSchemeToggle.js";
import { addCard, moveCard, type ShellCardState } from "./card-state.js";
import { parseIframeToShellMessage } from "../protocol.js";
import {
  type ColorSchemeMode,
  readStoredMode,
  resolveScheme,
  writeStoredMode,
} from "../color-scheme.js";
import type { ColorScheme, ComponentInfo, ShellToIframeMessage } from "../types.js";

/**
 * Three-zone Deloop shell (AWK-10):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ Top bar                                                     │
 *   ├─────────────┬───────────────────────────────────┬───────────┤
 *   │ Left        │ Canvas iframe                     │ Right     │
 *   │ sidebar     │ (full-document, isolated)         │ panel     │
 *   │             │                                   │           │
 *   └─────────────┴───────────────────────────────────┴───────────┘
 *
 * The shell uses standard Tailwind classes — no `wb-` prefix. Style isolation
 * between shell and canvas is enforced by the iframe boundary itself, per
 * ADR-0001. All shell ↔ iframe communication goes through `postMessage`.
 *
 * Card lifecycle (AWK-14):
 *   - Drop on canvas: iframe posts `componentDropped`; shell mints a
 *     UUID, stores `{cardId → CardEntry}`, sends `mount` back with x,y.
 *   - Click on card chrome: iframe posts `cardSelected`; shell looks up
 *     the entry and surfaces it in the right panel.
 *   - Drag on canvas: iframe posts `cardMoved` once on pointer-up; shell
 *     updates the stored x,y in place.
 */
export function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const queuedMessages = useRef<ShellToIframeMessage[]>([]);
  const [iframeReady, setIframeReady] = useState(false);
  // Card registry: cardId → component + position. The shell owns this;
  // the iframe is a renderer of mount messages and never invents cards
  // on its own. Transitions go through pure helpers in `./card-state.ts`
  // so AWK-14's drop/move/select acceptance criteria are unit-testable.
  const [cards, setCards] = useState<ShellCardState>(() => new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The user's preferred mode (light / dark / system). The wire only
  // ever carries a resolved scheme; this state is the single source of
  // truth for which icon to show and which mode to advance to on click.
  // Initialised from localStorage so reload preserves intent.
  const [mode, setMode] = useState<ColorSchemeMode>(() => readStoredMode());
  const [resolvedScheme, setResolvedScheme] = useState<ColorScheme>(() => resolveScheme(mode));

  function send(msg: ShellToIframeMessage) {
    if (iframeReady) {
      // Same-origin shell ↔ iframe per ADR-0001; pin targetOrigin to the
      // shell's own origin to keep the channel from leaking if the iframe
      // is ever navigated cross-origin (intentionally or otherwise).
      iframeRef.current?.contentWindow?.postMessage(msg, window.location.origin);
    } else {
      queuedMessages.current.push(msg);
    }
  }

  /**
   * Handles a sidebar drop on the canvas (AWK-14). The iframe owns the
   * native `drop` event and surfaces it as a `componentDropped` uplink;
   * the shell mints the cardId so it remains the source of truth for
   * the card list.
   */
  function handleComponentDropped(component: ComponentInfo, x: number, y: number): void {
    // crypto.randomUUID is available in every browser the shell targets
    // (modern Chromium/Firefox/Safari + a TLS-or-localhost origin, which
    // covers Vite's dev server and any production deployment).
    const cardId = crypto.randomUUID();
    setCards((prev) => addCard(prev, cardId, component, x, y));
    setSelectedId(cardId);
    send({
      type: "mount",
      cardId,
      // Vite's /@fs/ prefix allows the browser to import absolute filesystem
      // paths that are within server.fs.allow. See ADR-0002.
      componentPath: `/@fs${component.path}`,
      // The iframe resolves `mod[componentName]` strictly — no fallback.
      // The entry's `name` is a verbatim shim export identifier (ADR-0005).
      componentName: component.name,
      props: {},
      x,
      y,
    });
  }

  useEffect(() => {
    function handleMessage(event: MessageEvent<unknown>) {
      // Only accept messages from our own iframe to avoid cross-origin chatter.
      if (event.source !== iframeRef.current?.contentWindow) return;
      const msg = parseIframeToShellMessage(event.data);
      if (!msg) return;

      switch (msg.type) {
        case "iframeReady":
          setIframeReady(true);
          // Flush any messages queued while the iframe was hydrating.
          // Iframe is same-origin per ADR-0001, so we pin targetOrigin
          // rather than using the permissive "*".
          for (const queued of queuedMessages.current) {
            iframeRef.current?.contentWindow?.postMessage(queued, window.location.origin);
          }
          queuedMessages.current = [];
          break;
        case "cardSelected":
          // Promote the iframe's selection signal into shell state so
          // the right panel reflects the chosen canvas card. The
          // ComponentInfo lookup goes through the shell's card map —
          // the iframe never ships full component metadata on selection.
          setSelectedId(msg.cardId);
          break;
        case "cardMoved":
          // Persist the new position in the shell's card registry. No
          // `mount` echo back to the iframe — the iframe already moved
          // the card optimistically during the drag (locked scope: one
          // wire message at end of drag).
          setCards((prev) => moveCard(prev, msg.cardId, msg.x, msg.y));
          break;
        case "componentDropped":
          handleComponentDropped(msg.component, msg.x, msg.y);
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
    // `handleMessage` closes over `handleComponentDropped` and `send`,
    // both of which read `iframeReady`. Re-attach the listener whenever
    // `iframeReady` flips so a `componentDropped` arriving after the
    // iframe is ready doesn't see a stale `iframeReady=false` closure
    // and silently queue the resulting `mount` forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeReady]);

  /*
   * One matchMedia listener per shell, by design (AWK-79 decision 2).
   * The iframe never duplicates this — it just receives resolved
   * literals. We listen unconditionally; when `mode !== "system"` the
   * resolved scheme is `mode` and the OS event is ignored.
   */
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    function onChange() {
      // Re-resolve from the current mode. When the user has pinned
      // light or dark, the OS preference is irrelevant — the resolver
      // returns the pinned literal.
      setResolvedScheme(resolveScheme(mode));
    }
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [mode]);

  /*
   * Whenever mode changes, recompute and persist. Resolution happens
   * here once per change, plus reactively in the matchMedia listener
   * for the "system" case.
   */
  useEffect(() => {
    setResolvedScheme(resolveScheme(mode));
    writeStoredMode(mode);
  }, [mode]);

  /*
   * Broadcast the resolved scheme to the iframe whenever it changes —
   * also re-broadcast on `iframeReady` flip so a cold iframe reload
   * after the shell has already changed mode catches up. The iframe's
   * synchronous bootstrap covers the very first paint; this covers
   * every subsequent change.
   */
  useEffect(() => {
    send({ type: "setColorScheme", scheme: resolvedScheme });
    // `send` closes over `iframeReady`; re-running on `iframeReady`
    // change ensures we don't drop the broadcast that happened while
    // the iframe was still hydrating (it'll be queued by `send` and
    // flushed on iframeReady — this effect re-runs when iframeReady
    // becomes true, but the queued path also covers it).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedScheme, iframeReady]);

  const cycleMode = useCallback(() => {
    setMode((prev) => (prev === "light" ? "dark" : prev === "dark" ? "system" : "light"));
  }, []);

  const selected = selectedId != null ? (cards.get(selectedId) ?? null) : null;

  return (
    <div className="flex h-screen flex-col bg-neutral-950 text-neutral-200">
      {/* Top bar */}
      <header
        data-zone="top-bar"
        className="flex h-10 flex-shrink-0 items-center border-b border-neutral-800 px-4"
      >
        <h1 className="text-[13px] font-semibold text-neutral-300">Deloop</h1>
        <span className="ml-3 text-[11px] text-neutral-500">
          {iframeReady ? "Canvas ready" : "Canvas hydrating…"}
        </span>
        <div className="ml-auto flex items-center">
          <ColorSchemeToggle mode={mode} onCycle={cycleMode} />
        </div>
      </header>

      {/* Body: left sidebar | canvas | right panel */}
      <div className="flex min-h-0 flex-1">
        <aside
          data-zone="left-sidebar"
          className="flex w-60 flex-shrink-0 flex-col border-r border-neutral-800"
        >
          <div className="border-b border-neutral-800 px-4 py-3">
            <h2 className="text-[12px] font-semibold tracking-wide text-neutral-400 uppercase">
              Components
            </h2>
          </div>
          <ComponentList />
        </aside>

        <main data-zone="canvas" className="relative min-w-0 flex-1 overflow-hidden">
          <iframe
            ref={iframeRef}
            id="canvas"
            src="/iframe.html"
            className="h-full w-full border-0"
            title="Deloop canvas"
          />
        </main>

        <aside
          data-zone="right-panel"
          className="flex w-72 flex-shrink-0 flex-col border-l border-neutral-800"
        >
          <div className="border-b border-neutral-800 px-4 py-3">
            <h2 className="text-[12px] font-semibold tracking-wide text-neutral-400 uppercase">
              Properties
            </h2>
          </div>
          <div className="px-4 py-3 text-[12px] text-neutral-500">
            {selected ? (
              <>
                <p className="m-0 mb-1 font-medium text-neutral-300">{selected.component.name}</p>
                <p className="m-0 font-mono text-[11px]">{selected.component.relativePath}</p>
              </>
            ) : (
              "Select a component to inspect"
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

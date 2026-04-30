import { useEffect, useRef, useState } from "react";
import { ComponentList } from "./sidebar/ComponentList.js";
import { parseIframeToShellMessage } from "../protocol.js";
import type { ComponentInfo, ShellToIframeMessage } from "../types.js";

interface SelectedCard {
  cardId: string;
  component: ComponentInfo;
}

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
 */
export function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const queuedMessages = useRef<ShellToIframeMessage[]>([]);
  const [iframeReady, setIframeReady] = useState(false);
  const [selected, setSelected] = useState<SelectedCard | null>(null);

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
          // Selection currently flows top-down from the sidebar; we record
          // the iframe's selection signal but don't reconcile it back yet.
          break;
        case "cardMoved":
          // Card movement is part of AWK-10's protocol surface; the
          // pan/zoom canvas that produces these is a follow-up issue.
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

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

  function mountComponent(component: ComponentInfo) {
    const cardId = component.name;
    setSelected({ cardId, component });
    send({
      type: "mount",
      cardId,
      // Vite's /@fs/ prefix allows the browser to import absolute filesystem
      // paths that are within server.fs.allow. See ADR-0002.
      componentPath: `/@fs${component.path}`,
      props: {},
    });
  }

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
          <ComponentList onSelect={mountComponent} />
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

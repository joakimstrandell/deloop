import { useEffect, useRef, useState, type DragEvent } from "react";
import type { ComponentInfo } from "../../types.js";

/**
 * Sidebar list of discovered Component entries (see CONTEXT.md).
 *
 * Live updates: opens an `EventSource('/api/events')` and replaces local
 * state on every `discovery` event from the server. First paint comes from
 * a one-shot `GET /api/components`; on EventSource reconnect we re-fetch
 * REST to recover any events missed during the disconnect window.
 *
 * Drag protocol (AWK-12 → AWK-14):
 *
 * Each list item is `draggable`; on `dragstart` we set:
 *   - `application/x-deloop-component`: JSON of the full ComponentInfo.
 *     Custom MIME so only Deloop-aware drop targets accept it. AWK-14's
 *     canvas drop zone reads this to know what to mount.
 *   - `text/plain`: the component's `relativePath`. Universal fallback so
 *     drags into a textarea / file dialog produce a sensible string.
 *
 * The drag image is a custom "chip" rendered from a hidden DOM-attached
 * node — Safari ignores `setDragImage` if the node isn't in the DOM.
 *
 * Click-to-mount remains as a transitional bridge until the canvas drop
 * target lands in AWK-14; remove `onClick` once AWK-14 ships.
 */

export const COMPONENT_DRAG_MIME = "application/x-deloop-component";

/**
 * Populates a drag-event `dataTransfer` with the Deloop component drag
 * payload — extracted from the JSX handler so it can be unit-tested without
 * a DOM renderer. AWK-14's drop target reads `COMPONENT_DRAG_MIME` to
 * reconstruct the dropped component.
 *
 * `ghost` is the off-screen DOM node used for the custom drag preview;
 * pass `null` to skip the custom image (browser default kicks in).
 */
export function setComponentDragPayload(
  dataTransfer: DataTransfer,
  component: ComponentInfo,
  ghost: HTMLElement | null,
): void {
  dataTransfer.effectAllowed = "copy";
  dataTransfer.setData(COMPONENT_DRAG_MIME, JSON.stringify(component));
  dataTransfer.setData("text/plain", component.relativePath);
  if (ghost) {
    ghost.textContent = component.name;
    // 12,16 places the cursor's hotspot near the chip's left edge so the
    // drop point feels precise without obscuring the label.
    dataTransfer.setDragImage(ghost, 12, 16);
  }
}

interface Props {
  onSelect: (component: ComponentInfo) => void;
}

export function ComponentList({ onSelect }: Props) {
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draggingPath, setDraggingPath] = useState<string | null>(null);

  // Last time an SSE `discovery` event landed. Used to discard REST results
  // that started before the most recent SSE update — SSE is the
  // authoritative channel; REST is a catch-up after disconnect, and may
  // race against an in-flight SSE delivery on reconnect.
  const lastSseAt = useRef(0);
  const ghostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function refetch(): Promise<void> {
      const startedAt = Date.now();
      try {
        const resp = await fetch("/api/components");
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as ComponentInfo[];
        if (!active) return;
        if (lastSseAt.current >= startedAt) return; // SSE arrived first; ignore stale REST.
        setComponents(data);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    }

    void refetch();

    const es = new EventSource("/api/events");

    es.addEventListener("discovery", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as ComponentInfo[];
        lastSseAt.current = Date.now();
        if (!active) return;
        setComponents(data);
        setError(null);
        setLoading(false);
      } catch {
        // Malformed payload — drop silently rather than blowing up the UI.
        // Subsequent events will recover state.
      }
    });

    // The browser auto-reconnects on transient errors. `open` fires both on
    // initial connect and on every successful reconnect, so we treat each
    // open as a chance to do a catch-up REST fetch in case events fired
    // during the disconnect window. The lastSseAt guard prevents overwriting
    // a fresh post-reconnect SSE event with a stale REST snapshot.
    let firstOpen = true;
    es.addEventListener("open", () => {
      if (firstOpen) {
        firstOpen = false;
        return;
      }
      void refetch();
    });

    return () => {
      active = false;
      es.close();
    };
  }, []);

  function handleDragStart(event: DragEvent<HTMLButtonElement>, component: ComponentInfo): void {
    setComponentDragPayload(event.dataTransfer, component, ghostRef.current);
    setDraggingPath(component.path);
  }

  function handleDragEnd(): void {
    setDraggingPath(null);
  }

  if (loading) {
    return <p className="px-4 py-3 text-xs text-gray-500">Discovering components…</p>;
  }
  if (error) {
    return <p className="px-4 py-3 text-xs text-red-400">Error: {error}</p>;
  }
  if (components.length === 0) {
    return <p className="px-4 py-3 text-xs text-gray-500">No components found</p>;
  }

  return (
    <>
      <ul className="m-0 list-none flex-1 overflow-y-auto p-0 py-1">
        {components.map((component) => {
          const dragging = draggingPath === component.path;
          return (
            <li key={component.path}>
              <button
                type="button"
                draggable
                title={component.relativePath}
                onClick={() => onSelect(component)}
                onDragStart={(e) => handleDragStart(e, component)}
                onDragEnd={handleDragEnd}
                className={[
                  "w-full cursor-grab px-4 py-1.5 text-left text-[13px] text-gray-300",
                  "transition-colors hover:bg-white/5 active:cursor-grabbing active:bg-white/10",
                  dragging ? "opacity-50" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                data-component-path={component.path}
              >
                {component.name}
              </button>
            </li>
          );
        })}
      </ul>
      {/*
        Drag-image template — must be in the DOM for Safari to honour
        setDragImage. Positioned far off-screen so the user never sees
        this directly; the browser snapshots it at dragstart.
      */}
      <div
        ref={ghostRef}
        aria-hidden="true"
        className="pointer-events-none absolute -top-[1000px] -left-[1000px] rounded-md bg-neutral-800 px-3 py-1.5 text-[13px] font-medium text-neutral-100 shadow-lg"
      />
    </>
  );
}

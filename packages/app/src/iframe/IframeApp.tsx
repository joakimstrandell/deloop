import { type ComponentType, useEffect, useReducer } from "react";
import { parseShellToIframeMessage } from "../protocol.js";
import type { IframeToShellMessage, PseudoState } from "../types.js";

interface MountedCard {
  cardId: string;
  /** Vite /@fs/ URL or other module specifier for the component module. */
  componentPath: string;
  props: Record<string, unknown>;
  pseudoState: PseudoState;
  Component: ComponentType<Record<string, unknown>> | null;
  error: string | null;
}

type State = Map<string, MountedCard>;

type Action =
  | { type: "MOUNT"; cardId: string; componentPath: string; props: Record<string, unknown> }
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

export function IframeApp() {
  const [mounted, dispatch] = useReducer(reducer, new Map<string, MountedCard>());

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
            const Component = mod["default"];
            if (typeof Component !== "function") {
              throw new Error(`${msg.componentPath} does not export a default React component`);
            }
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
      }
    }

    window.addEventListener("message", handleMessage);
    // Tell the shell the iframe is hydrated and ready to accept messages.
    postToShell({ type: "iframeReady" });
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div className="flex min-h-screen flex-wrap content-start gap-6 p-6">
      {Array.from(mounted.values()).map((entry) => (
        <ComponentCard
          key={entry.cardId}
          entry={entry}
          onSelect={() => postToShell({ type: "cardSelected", cardId: entry.cardId })}
        />
      ))}
    </div>
  );
}

function ComponentCard({ entry, onSelect }: { entry: MountedCard; onSelect: () => void }) {
  if (entry.error) {
    return (
      <div
        data-card-id={entry.cardId}
        data-pseudo-state={entry.pseudoState}
        className="max-w-md rounded-lg border border-red-600 p-4 font-mono text-xs text-red-600"
      >
        <strong>Error loading {entry.cardId}</strong>
        <pre className="mt-2 whitespace-pre-wrap">{entry.error}</pre>
      </div>
    );
  }

  return (
    <div
      data-card-id={entry.cardId}
      data-pseudo-state={entry.pseudoState}
      onClick={onSelect}
      className="rounded-lg border border-gray-200 p-4"
    >
      <div className="mb-3 font-mono text-[11px] text-gray-400">{entry.cardId}</div>
      {entry.Component ? (
        <entry.Component {...entry.props} />
      ) : (
        <div className="font-mono text-xs text-gray-500">Loading {entry.cardId}…</div>
      )}
    </div>
  );
}

import { type ComponentType, useEffect, useReducer } from "react";
import type { IframeToShellMessage, ShellToIframeMessage } from "../types.js";

interface MountedComponent {
  id: string;
  /** Vite /@fs/ URL for the component module */
  path: string;
  props: Record<string, unknown>;
  Component: ComponentType<Record<string, unknown>> | null;
  error: string | null;
}

type State = Map<string, MountedComponent>;

type Action =
  | { type: "LOADING"; id: string; path: string; props: Record<string, unknown> }
  | { type: "READY"; id: string; Component: ComponentType<Record<string, unknown>> }
  | { type: "ERROR"; id: string; error: string }
  | { type: "UNMOUNT"; id: string }
  | { type: "UPDATE_PROPS"; id: string; props: Record<string, unknown> };

function reducer(state: State, action: Action): State {
  const next = new Map(state);
  switch (action.type) {
    case "LOADING":
      next.set(action.id, {
        id: action.id,
        path: action.path,
        props: action.props,
        Component: null,
        error: null,
      });
      return next;
    case "READY": {
      const entry = next.get(action.id);
      if (entry) next.set(action.id, { ...entry, Component: action.Component });
      return next;
    }
    case "ERROR": {
      const entry = next.get(action.id);
      if (entry) next.set(action.id, { ...entry, error: action.error });
      return next;
    }
    case "UNMOUNT":
      next.delete(action.id);
      return next;
    case "UPDATE_PROPS": {
      const entry = next.get(action.id);
      if (entry) next.set(action.id, { ...entry, props: action.props });
      return next;
    }
  }
}

function postToShell(msg: IframeToShellMessage) {
  window.parent.postMessage(msg, "*");
}

export function IframeApp() {
  const [mounted, dispatch] = useReducer(reducer, new Map<string, MountedComponent>());

  useEffect(() => {
    async function handleMessage(event: MessageEvent<ShellToIframeMessage>) {
      const msg = event.data;
      if (!msg?.type) return;

      switch (msg.type) {
        case "MOUNT_COMPONENT": {
          dispatch({ type: "LOADING", id: msg.id, path: msg.path, props: msg.props });
          try {
            // Vite serves user components via /@fs/ prefix (see ADR-0002).
            // The /* @vite-ignore */ comment suppresses the dynamic import warning.
            const mod = (await import(/* @vite-ignore */ msg.path)) as Record<string, unknown>;
            const Component = mod["default"];
            if (typeof Component !== "function") {
              throw new Error(`${msg.path} does not export a default React component`);
            }
            dispatch({
              type: "READY",
              id: msg.id,
              Component: Component as ComponentType<Record<string, unknown>>,
            });
            postToShell({ type: "COMPONENT_READY", id: msg.id });
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            dispatch({ type: "ERROR", id: msg.id, error });
            postToShell({ type: "COMPONENT_ERROR", id: msg.id, error });
          }
          break;
        }
        case "UNMOUNT_COMPONENT":
          dispatch({ type: "UNMOUNT", id: msg.id });
          break;
        case "UPDATE_PROPS":
          dispatch({ type: "UPDATE_PROPS", id: msg.id, props: msg.props });
          break;
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <div
      style={{
        padding: "24px",
        display: "flex",
        flexWrap: "wrap",
        gap: "24px",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      {Array.from(mounted.values()).map((entry) => (
        <ComponentCard key={entry.id} entry={entry} />
      ))}
    </div>
  );
}

function ComponentCard({ entry }: { entry: MountedComponent }) {
  if (entry.error) {
    return (
      <div
        style={{
          border: "1px solid #dc2626",
          borderRadius: "8px",
          padding: "16px",
          color: "#dc2626",
          fontSize: "12px",
          fontFamily: "monospace",
          maxWidth: "400px",
        }}
      >
        <strong>Error loading {entry.id}</strong>
        <pre style={{ marginTop: "8px", whiteSpace: "pre-wrap" }}>{entry.error}</pre>
      </div>
    );
  }

  if (!entry.Component) {
    return (
      <div
        style={{
          border: "1px solid #374151",
          borderRadius: "8px",
          padding: "16px",
          color: "#9ca3af",
          fontSize: "12px",
        }}
      >
        Loading {entry.id}…
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px" }}>
      <div
        style={{
          marginBottom: "12px",
          fontSize: "11px",
          color: "#9ca3af",
          fontFamily: "monospace",
        }}
      >
        {entry.id}
      </div>
      <entry.Component {...entry.props} />
    </div>
  );
}

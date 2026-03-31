import { useRef, useState } from "react";
import { ComponentList } from "./sidebar/ComponentList.js";
import type { ComponentInfo, ShellToIframeMessage } from "../types.js";

export function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [selected, setSelected] = useState<ComponentInfo | null>(null);

  function mountComponent(component: ComponentInfo) {
    setSelected(component);

    const msg: ShellToIframeMessage = {
      type: "MOUNT_COMPONENT",
      id: component.name,
      // Vite's /@fs/ prefix allows the browser to import absolute filesystem paths
      // that are within server.fs.allow. See ADR-0002.
      path: `/@fs${component.path}`,
      props: {},
    };

    iframeRef.current?.contentWindow?.postMessage(msg, "*");
  }

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        background: "#0a0a0f",
        color: "#e5e7eb",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: "14px",
      }}
    >
      {/* Left sidebar — component list */}
      <aside
        style={{
          width: "240px",
          borderRight: "1px solid #1f2937",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #1f2937",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#d1d5db" }}>Deloop</h1>
        </div>
        <ComponentList onSelect={mountComponent} />
      </aside>

      {/* Canvas area */}
      <main style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <iframe
          ref={iframeRef}
          id="canvas"
          src="/iframe.html"
          style={{ width: "100%", height: "100%", border: "none" }}
          title="Deloop canvas"
        />
      </main>

      {/* Right sidebar — properties (placeholder) */}
      <aside
        style={{
          width: "272px",
          borderLeft: "1px solid #1f2937",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #1f2937",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "13px", fontWeight: 600, color: "#d1d5db" }}>
            Properties
          </h2>
        </div>
        <div style={{ padding: "12px 16px", fontSize: "12px", color: "#6b7280" }}>
          {selected ? (
            <>
              <p style={{ margin: "0 0 4px", color: "#d1d5db", fontWeight: 500 }}>
                {selected.name}
              </p>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: "11px" }}>
                {selected.relativePath}
              </p>
            </>
          ) : (
            "Select a component to inspect"
          )}
        </div>
      </aside>
    </div>
  );
}

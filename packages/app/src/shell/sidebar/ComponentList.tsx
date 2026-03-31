import { useEffect, useState } from "react";
import type { ComponentInfo } from "../../types.js";

interface Props {
  onSelect: (component: ComponentInfo) => void;
}

export function ComponentList({ onSelect }: Props) {
  const [components, setComponents] = useState<ComponentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/components")
      .then((r) => r.json() as Promise<ComponentInfo[]>)
      .then((data) => {
        setComponents(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(String(err));
        setLoading(false);
      });
  }, []);

  const baseStyle = {
    padding: "4px 8px 12px",
    fontSize: "12px",
    color: "#6b7280",
  };

  if (loading) return <div style={baseStyle}>Discovering components…</div>;
  if (error) return <div style={{ ...baseStyle, color: "#f87171" }}>Error: {error}</div>;
  if (components.length === 0) {
    return <div style={baseStyle}>No components found in src/components/</div>;
  }

  return (
    <ul style={{ flex: 1, overflowY: "auto", margin: 0, padding: "4px 0", listStyle: "none" }}>
      {components.map((component) => (
        <li key={component.path}>
          <button
            onClick={() => onSelect(component)}
            style={{
              width: "100%",
              padding: "6px 16px",
              textAlign: "left",
              fontSize: "13px",
              color: "#d1d5db",
              background: "none",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "#111827";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
            }}
          >
            {component.name}
          </button>
        </li>
      ))}
    </ul>
  );
}

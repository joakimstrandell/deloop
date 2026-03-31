import { useEffect, useState } from "react";
import { Button } from "@deloop/ui";
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

  if (loading) {
    return <p className="px-4 py-3 text-xs text-gray-500">Discovering components…</p>;
  }
  if (error) {
    return <p className="px-4 py-3 text-xs text-red-400">Error: {error}</p>;
  }
  if (components.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-gray-500">No components found in src/components/</p>
    );
  }

  return (
    <ul className="flex-1 overflow-y-auto py-1 list-none m-0 p-0">
      {components.map((component) => (
        <li key={component.path}>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start px-4 py-1.5 rounded-none text-gray-300 text-[13px]"
            onClick={() => onSelect(component)}
          >
            {component.name}
          </Button>
        </li>
      ))}
    </ul>
  );
}

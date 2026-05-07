import { label } from "@/lib/utils";

/**
 * Imports its sibling via the `@/` path alias declared in
 * `tsconfig.app.json`. The alias must resolve through Deloop's Vite
 * middleware for this component to mount. AWK-75 dogfood regression.
 */
export function Example() {
  return <button type="button">Example: {label()}</button>;
}

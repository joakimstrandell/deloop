import { Button, type ButtonProps } from "@deloop/ui";

// Wraps @deloop/ui Button with demo defaults for the canvas.
// Props passed by the canvas (via postMessage) override these defaults.
export default function ButtonDemo(props: ButtonProps) {
  return <Button label="Button" {...props} />;
}

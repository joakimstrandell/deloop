/**
 * Deloop shim for `Button`.
 *
 * The named export `Button` is what the Deloop sidebar lists. Each named
 * export of a `*.deloop.tsx` file becomes one Component entry; this shim
 * contributes a single entry that renders the default-variant Button with
 * a sensible label so the Card has visible content out of the box.
 *
 * The aliased re-import (`Button as BaseButton`) keeps the local export
 * identifier free for the named-export-as-entry rule.
 */
import { Button as BaseButton } from "./button.js";

export function Button() {
  return <BaseButton>Button</BaseButton>;
}

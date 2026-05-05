/**
 * Deloop shim for `Tooltip`.
 *
 * Compound + slot + provider example: a bare `Tooltip` import would render
 * nothing useful (and Radix throws without a `TooltipProvider` ancestor).
 * This shim composes the full working tooltip — provider wrapper, default
 * trigger, default content — so the Card mounts a meaningful instance on
 * a single drag.
 *
 * `delayDuration={0}` keeps the tooltip reachable in tests without forcing
 * a wait. The aliased imports keep our local export identifier free for
 * the named-export-as-entry rule.
 */
import { Button as BaseButton } from "./button.js";
import {
  Tooltip as BaseTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip.js";

export function Tooltip() {
  return (
    <TooltipProvider delayDuration={0}>
      <BaseTooltip>
        <TooltipTrigger asChild>
          <BaseButton variant="outline">Hover me</BaseButton>
        </TooltipTrigger>
        <TooltipContent>Tooltip content</TooltipContent>
      </BaseTooltip>
    </TooltipProvider>
  );
}

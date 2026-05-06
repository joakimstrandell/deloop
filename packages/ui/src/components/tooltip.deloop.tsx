import { Button as BaseButton } from "./button";
import { Tooltip as BaseTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./tooltip";

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

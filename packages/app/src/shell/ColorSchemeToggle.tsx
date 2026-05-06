/**
 * Cycle-button toggle for the canvas color scheme (AWK-79).
 *
 * One Sun / Moon / Monitor lucide icon that advances `light → dark →
 * system → light` per click. The icon shown reflects the user's `Mode`
 * (Monitor for `system`), not the resolved scheme — that's the locked
 * UX decision; users still get a tooltip telling them which mode is
 * active right now.
 *
 * The toggle deliberately does **not** theme the shell itself. The
 * shell stays dark-on-dark with hardcoded `bg-neutral-*` classes
 * (locked decision 5). All the resolved-scheme effort is spent on the
 * canvas iframe, which is what the user is actually looking at.
 */
import { Monitor, Moon, Sun } from "lucide-react";
import type { ColorSchemeMode } from "../color-scheme.js";

interface Props {
  mode: ColorSchemeMode;
  onCycle: () => void;
}

const NEXT_MODE_LABEL: Record<ColorSchemeMode, string> = {
  light: "Switch to dark",
  dark: "Switch to system",
  system: "Switch to light",
};

const CURRENT_MODE_LABEL: Record<ColorSchemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function ColorSchemeToggle({ mode, onCycle }: Props) {
  const Icon = mode === "light" ? Sun : mode === "dark" ? Moon : Monitor;
  // The aria-label combines current state and next action so screen
  // readers and hover-tooltips both surface the affordance. Native
  // `title` is enough here — bringing in a Radix Tooltip just for the
  // shell's only icon button would add a TooltipProvider boundary
  // problem we don't need to solve yet.
  const label = `${CURRENT_MODE_LABEL[mode]} mode — click to ${NEXT_MODE_LABEL[mode].toLowerCase()}`;
  return (
    <button
      type="button"
      onClick={onCycle}
      aria-label={label}
      title={label}
      data-color-scheme-mode={mode}
      className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 transition-colors hover:bg-white/5 hover:text-neutral-200 active:bg-white/10"
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}

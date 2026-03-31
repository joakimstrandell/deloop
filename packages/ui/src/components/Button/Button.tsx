import type { ReactNode } from "react";

export interface ButtonProps {
  /** Text label — use this or children, not both */
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md" | "lg";
  disabled?: boolean;
  onClick?: () => void;
  /** Extra Tailwind classes for layout overrides (e.g. "w-full justify-start") */
  className?: string;
  children?: ReactNode;
}

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800",
  secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 active:bg-gray-300",
  // bg-current/10 is relative to the inherited text colour — works on both
  // light and dark backgrounds without needing a separate dark variant.
  ghost: "text-current hover:bg-current/10 active:bg-current/15",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-3.5 py-1.5 text-sm",
  lg: "px-5 py-2.5 text-base",
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  disabled = false,
  onClick,
  className = "",
  children,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded-md font-medium transition-colors",
        "cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children ?? label}
    </button>
  );
}

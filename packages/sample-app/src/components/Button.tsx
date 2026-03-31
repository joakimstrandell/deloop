import type { CSSProperties } from "react";

export interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  onClick?: () => void;
}

const base: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "8px 16px",
  borderRadius: "6px",
  fontSize: "14px",
  fontWeight: 500,
  lineHeight: 1,
  cursor: "pointer",
  border: "1px solid transparent",
  transition: "opacity 0.15s, background 0.15s",
  fontFamily: "inherit",
};

const variants: Record<string, CSSProperties> = {
  primary: { background: "#3b82f6", color: "#fff", borderColor: "#3b82f6" },
  secondary: { background: "transparent", color: "#3b82f6", borderColor: "#3b82f6" },
  ghost: { background: "transparent", color: "#6b7280", borderColor: "transparent" },
};

export default function Button({
  label,
  variant = "primary",
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      style={{
        ...base,
        ...variants[variant],
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

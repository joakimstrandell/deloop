export interface BadgeProps {
  label: string;
  variant?: "neutral" | "info" | "success" | "warning" | "error";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  neutral: "bg-gray-100 text-gray-700",
  info: "bg-blue-50 text-blue-700",
  success: "bg-green-50 text-green-700",
  warning: "bg-amber-50 text-amber-700",
  error: "bg-red-50 text-red-700",
};

export function Badge({ label, variant = "neutral" }: BadgeProps) {
  return (
    <span
      className={[
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
        variantClasses[variant],
      ].join(" ")}
    >
      {label}
    </span>
  );
}

import type { ReactNode } from "react";

type TextTag = "p" | "span" | "h1" | "h2" | "h3" | "h4";

export interface TextProps {
  as?: TextTag;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  weight?: "normal" | "medium" | "semibold" | "bold";
  color?: "default" | "muted" | "subtle";
  className?: string;
  children: ReactNode;
}

const sizeClasses: Record<NonNullable<TextProps["size"]>, string> = {
  xs: "text-xs",
  sm: "text-sm",
  md: "text-base",
  lg: "text-lg",
  xl: "text-xl",
  "2xl": "text-2xl",
};

const weightClasses: Record<NonNullable<TextProps["weight"]>, string> = {
  normal: "font-normal",
  medium: "font-medium",
  semibold: "font-semibold",
  bold: "font-bold",
};

const colorClasses: Record<NonNullable<TextProps["color"]>, string> = {
  default: "text-gray-900",
  muted: "text-gray-500",
  subtle: "text-gray-400",
};

export function Text({
  as: Tag = "p",
  size = "md",
  weight = "normal",
  color = "default",
  className = "",
  children,
}: TextProps) {
  return (
    <Tag
      className={[sizeClasses[size], weightClasses[weight], colorClasses[color], className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </Tag>
  );
}

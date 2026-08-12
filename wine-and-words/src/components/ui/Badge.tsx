import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: "burgundy" | "gold" | "neutral" | "danger";
}

const variantClasses: Record<NonNullable<BadgeProps["variant"]>, string> = {
  burgundy: "bg-burgundy text-cream",
  gold: "bg-gold/90 text-burgundy-dark",
  neutral: "bg-cream-dark text-burgundy-dark",
  danger: "bg-red-100 text-red-700",
};

export function Badge({ className, variant = "neutral", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

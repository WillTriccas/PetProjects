"use client";

import { useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { roundToHalf, formatRating } from "@/lib/domain/ratings";

export interface StarRatingProps {
  /** Current rating value (1–5, half-star increments). */
  value: number;
  /** Called with the new rating when the user picks one. Omit for read-only display. */
  onChange?: (value: number) => void;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const SIZE_CLASSES: Record<NonNullable<StarRatingProps["size"]>, string> = {
  sm: "text-base",
  md: "text-2xl",
  lg: "text-3xl",
};

/**
 * Accessible 1–5 half-star rating control. Renders as an interactive,
 * keyboard-navigable radiogroup when `onChange` is provided, or as a
 * read-only display otherwise.
 */
export function StarRating({ value, onChange, size = "md", label = "Rating" }: StarRatingProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const interactive = !!onChange;
  const display = hovered ?? value;

  const setValue = (next: number) => {
    if (!onChange) return;
    onChange(roundToHalf(next));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setValue(Math.min(5, value + 0.5));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setValue(Math.max(1, value - 0.5));
    } else if (e.key === "Home") {
      e.preventDefault();
      setValue(1);
    } else if (e.key === "End") {
      e.preventDefault();
      setValue(5);
    }
  };

  return (
    <div
      role={interactive ? "slider" : "img"}
      aria-label={interactive ? label : `${label}: ${formatRating(value)} out of 5 stars`}
      aria-valuemin={interactive ? 1 : undefined}
      aria-valuemax={interactive ? 5 : undefined}
      aria-valuenow={interactive ? value : undefined}
      aria-valuetext={interactive ? `${formatRating(value)} out of 5 stars` : undefined}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={handleKeyDown}
      onMouseLeave={() => setHovered(null)}
      className={cn(
        "inline-flex items-center gap-1 focus:outline-none",
        interactive && "focus-visible:ring-2 focus-visible:ring-burgundy rounded"
      )}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fillFraction = Math.max(0, Math.min(1, display - (star - 1)));
        return (
          <button
            key={star}
            type="button"
            tabIndex={-1}
            disabled={!interactive}
            aria-hidden="true"
            onMouseMove={(e) => {
              if (!interactive) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const half = e.clientX - rect.left < rect.width / 2;
              setHovered(star - (half ? 0.5 : 0));
            }}
            onClick={() => setValue(hovered ?? star)}
            className={cn(
              "relative leading-none",
              SIZE_CLASSES[size],
              interactive ? "cursor-pointer" : "cursor-default"
            )}
          >
            <span className="text-gold/30">★</span>
            <span
              className="absolute inset-y-0 left-0 overflow-hidden text-gold"
              style={{ width: `${fillFraction * 100}%` }}
            >
              ★
            </span>
          </button>
        );
      })}
      {!interactive && (
        <span className="ml-1 text-sm text-burgundy-dark/70">{formatRating(value)}</span>
      )}
    </div>
  );
}

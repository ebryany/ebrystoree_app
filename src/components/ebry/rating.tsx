import { useState } from "react";
import { Star } from "lucide-react";

import { cn } from "@/lib/utils";

export function StarRating({
  value,
  size = "sm",
  className,
}: {
  value: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const px = size === "lg" ? "size-6" : size === "md" ? "size-5" : "size-4";
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Rating ${value.toFixed(1)} dari 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = value >= i - 0.25;
        const half = !filled && value >= i - 0.75;
        return (
          <Star
            key={i}
            aria-hidden="true"
            className={cn(
              px,
              "transition-colors duration-200",
              filled || half ? "fill-aurora text-aurora" : "text-muted-foreground/40",
              half && "opacity-60",
            )}
          />
        );
      })}
    </span>
  );
}

export function StarInput({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label="Beri rating">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i}
          aria-label={`${i} bintang`}
          disabled={disabled}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(0)}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(0)}
          onClick={() => onChange(i)}
          className="rounded-md p-1 transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          <Star
            aria-hidden="true"
            className={cn(
              "size-7",
              shown >= i ? "fill-aurora text-aurora" : "text-muted-foreground/40",
            )}
          />
        </button>
      ))}
    </div>
  );
}

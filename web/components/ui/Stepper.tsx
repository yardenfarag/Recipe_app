"use client";

import { Minus, Plus } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

const stepButton =
  "grid h-9 w-9 shrink-0 place-items-center rounded-[10px] text-text transition-[background-color,opacity,transform] hover:bg-surface active:scale-95 pointer-coarse:h-11 pointer-coarse:w-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:hover:bg-transparent aria-disabled:active:scale-100";

/**
 * A number with − and + beside it, such as servings. The value is read out as it changes. At either end the
 * button greys out but keeps focus (aria-disabled, not disabled), so a keyboard user isn't thrown off it.
 */
export function Stepper({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  label,
  labelledBy,
  decreaseLabel,
  increaseLabel,
  children,
  spokenValue,
  trackId,
  className,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** What the number is, for screen readers. Or point at a visible label with `labelledBy`. */
  label?: string;
  labelledBy?: string;
  decreaseLabel: string;
  increaseLabel: string;
  /** What to show between the buttons. Defaults to the number. */
  children?: ReactNode;
  /** What a screen reader hears when the value changes: "4 servings". */
  spokenValue?: string;
  /** Activity-log id prefix (ADR 020): the buttons log `<trackId>.decrease` and `<trackId>.increase`. */
  trackId?: string;
  className?: string;
}) {
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <div role="group" aria-label={label} aria-labelledby={labelledBy} className={cn("inline-flex items-center gap-1 rounded-btn bg-element p-1", className)}>
      <button
        type="button"
        data-track={trackId ? `${trackId}.decrease` : undefined}
        aria-label={decreaseLabel}
        aria-disabled={atMin}
        onClick={() => !atMin && onChange(value - 1)}
        className={stepButton}
      >
        <Minus aria-hidden className="h-[18px] w-[18px]" />
      </button>
      <output aria-live="polite" aria-atomic className="min-w-8 px-1 text-center text-sm font-bold whitespace-nowrap text-text tabular-nums">
        <span aria-hidden={spokenValue ? true : undefined}>{children ?? value}</span>
        {spokenValue ? <span className="sr-only">{spokenValue}</span> : null}
      </output>
      <button
        type="button"
        data-track={trackId ? `${trackId}.increase` : undefined}
        aria-label={increaseLabel}
        aria-disabled={atMax}
        onClick={() => !atMax && onChange(value + 1)}
        className={stepButton}
      >
        <Plus aria-hidden className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

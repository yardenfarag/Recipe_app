"use client";

import { useDirection } from "@radix-ui/react-direction";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type Segment<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  /** A longer description, shown as the browser's tooltip. */
  title?: string;
  /** A stable id for the activity log (ADR 020). */
  trackId?: string;
  /** For tabs: the id of the panel this tab shows. */
  controls?: string;
  /** Icon only; the label is still read out. */
  iconOnly?: boolean;
};

/**
 * Two or three choices side by side where exactly one is on: Spoons/Grams, grid/list, Ingredients/Steps. Tab
 * reaches the chosen one and the arrow keys move between them (following the reading direction), as in a radio
 * group. `kind="tabs"` announces them as tabs, for when each choice shows a different panel.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  kind = "radio",
  size = "md",
  fullWidth = false,
  describedBy,
  className,
}: {
  options: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** What is being chosen, for screen readers. */
  label: string;
  kind?: "radio" | "tabs";
  size?: "sm" | "md";
  fullWidth?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const rtl = useDirection() === "rtl";
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    const step = event.key === forward || event.key === "ArrowDown" ? 1 : event.key === back || event.key === "ArrowUp" ? -1 : null;
    const target = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : step == null ? null : (index + step + options.length) % options.length;
    if (target == null) return;
    event.preventDefault();
    onChange(options[target].value);
    buttons.current[target]?.focus();
  };

  return (
    <div
      role={kind === "tabs" ? "tablist" : "radiogroup"}
      aria-label={label}
      aria-describedby={describedBy}
      className={cn("gap-1 rounded-btn bg-element p-1", fullWidth ? "flex" : "inline-flex", className)}
    >
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role={kind === "tabs" ? "tab" : "radio"}
            {...(kind === "tabs" ? { "aria-selected": on, "aria-controls": option.controls } : { "aria-checked": on })}
            aria-label={option.iconOnly ? option.label : undefined}
            tabIndex={on ? 0 : -1}
            title={option.title ?? (option.iconOnly ? option.label : undefined)}
            data-track={option.trackId}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-[10px] text-sm font-semibold transition-colors",
              size === "sm" ? "h-9 pointer-coarse:h-10" : "h-10",
              option.iconOnly ? (size === "sm" ? "w-9 pointer-coarse:w-10" : "w-10") : "px-3.5",
              fullWidth && "flex-1",
              on ? "bg-surface text-text shadow-soft" : "text-muted hover:text-text",
            )}
          >
            {option.icon}
            {option.iconOnly ? null : option.label}
          </button>
        );
      })}
    </div>
  );
}

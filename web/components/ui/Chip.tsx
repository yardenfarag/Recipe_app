import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

type ChipSize = "sm" | "md";

/**
 * The look of a pill filter chip, for links and menu triggers that sit in a row of chips. A chosen chip is filled
 * with the text colour, so it stands out in every theme pack. 44 px tall under a finger, 40 under a mouse.
 */
export const chipClasses = ({ selected = false, size = "md", className }: { selected?: boolean; size?: ChipSize; className?: string } = {}) =>
  cn(
    "inline-flex shrink-0 select-none items-center gap-2 rounded-full border font-semibold whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50",
    size === "sm" ? "h-9 px-3.5 text-[13px] pointer-coarse:h-11" : "h-10 px-4 text-sm pointer-coarse:h-11",
    selected ? "border-text bg-text text-bg" : "border-border bg-transparent text-text hover:bg-element active:bg-selected",
    className,
  );

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "role"> & {
  /** Whether the filter is on. Left out for a chip that only does something (opens a dialog). */
  selected?: boolean;
  size?: ChipSize;
  /**
   * "toggle" (the default) says pressed or not; "radio" is one of a set where exactly one is chosen, inside a
   * `role="radiogroup"`.
   */
  kind?: "toggle" | "radio";
  /** A stable id for the activity log (ADR 020); see Button's `trackId`. */
  trackId?: string;
};

/** A pill filter chip: a toggle button that says whether it is on. */
export const Chip = forwardRef<HTMLButtonElement, ChipProps>(function Chip(
  { selected, size = "md", kind = "toggle", trackId, className, type = "button", children, ...props },
  ref,
) {
  const state =
    selected === undefined ? {} : kind === "radio" ? { role: "radio" as const, "aria-checked": selected } : { "aria-pressed": selected };
  return (
    <button ref={ref} type={type} data-track={trackId} {...state} {...props} className={chipClasses({ selected, size, className })}>
      {children}
    </button>
  );
});

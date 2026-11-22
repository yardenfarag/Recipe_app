"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

export type IconButtonVariant = "ghost" | "tile" | "photo";

const variants: Record<IconButtonVariant, string> = {
  // On a page or inside a tile: no fill until hovered.
  ghost: "text-muted hover:bg-element hover:text-text active:bg-selected",
  // A small tile of its own, as in a page's top bar.
  tile: "border border-border bg-surface text-text hover:bg-element active:bg-selected",
  // On top of a photo.
  photo: "bg-scrim/60 text-on-scrim backdrop-blur-md hover:bg-scrim/75 active:bg-scrim/85",
};

/** The shape and colours of a 44 px icon button, for links that look like one. */
export const iconButtonClasses = (variant: IconButtonVariant = "ghost", className?: string) =>
  cn("grid h-11 w-11 shrink-0 place-items-center rounded-btn transition-colors disabled:opacity-50", variants[variant], className);

/** A 44 px button with only an icon. The label is read out and shown as a tooltip. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    icon: ReactNode;
    variant?: IconButtonVariant;
    tooltip?: boolean;
    /** A stable id for the activity log (ADR 020); see Button's `trackId`. */
    trackId?: string;
  }
>(function IconButton({ label, icon, variant = "ghost", tooltip = true, className, type = "button", trackId, ...props }, ref) {
  return (
    <Tooltip label={label} disabled={!tooltip}>
      <button ref={ref} type={type} aria-label={label} data-track={trackId} {...props} className={iconButtonClasses(variant, className)}>
        {icon}
      </button>
    </Tooltip>
  );
});

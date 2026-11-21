"use client";

import { useDirection } from "@radix-ui/react-direction";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement, ReactNode } from "react";

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <RadixTooltip.Provider delayDuration={300} skipDelayDuration={150}>
    {children}
  </RadixTooltip.Provider>
);

/** A short label on hover and keyboard focus. Never the only place important text lives. */
export function Tooltip({
  label,
  side = "top",
  children,
  disabled = false,
  className = "",
}: {
  label: string;
  /** "end" is the side away from the reading start: right in English, left in Hebrew. */
  side?: "top" | "bottom" | "end";
  children: ReactElement;
  disabled?: boolean;
  className?: string;
}) {
  const rtl = useDirection() === "rtl";
  const physicalSide = side === "end" ? (rtl ? "left" : "right") : side;
  if (disabled) return children;
  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={physicalSide}
          sideOffset={8}
          className={`z-50 animate-fade-in rounded-lg bg-text px-2.5 py-1.5 text-xs font-semibold text-surface shadow-soft ${className}`}
        >
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}

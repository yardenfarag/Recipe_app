"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";

/** A round button with only an icon. The label is read out and shown as a tooltip. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactNode; tooltip?: boolean }
>(function IconButton({ label, icon, tooltip = true, className, type = "button", ...props }, ref) {
  return (
    <Tooltip label={label} disabled={!tooltip}>
      <button
        ref={ref}
        type={type}
        aria-label={label}
        {...props}
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-element hover:text-text active:bg-selected disabled:opacity-50",
          className,
        )}
      >
        {icon}
      </button>
    </Tooltip>
  );
});

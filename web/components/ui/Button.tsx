import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
type Size = "sm" | "md" | "lg";

// The page's main action is set in the display face; quieter buttons stay in the body face.
const variants: Record<ButtonVariant, string> = {
  primary: "bg-primary font-display font-bold text-on-primary hover:brightness-105 active:brightness-95",
  secondary: "bg-primary-soft font-semibold text-primary-text hover:brightness-97 active:brightness-95",
  outline: "border border-border bg-surface font-semibold text-text hover:bg-element active:bg-selected",
  ghost: "font-semibold text-text hover:bg-element active:bg-selected",
  danger: "bg-danger font-display font-bold text-surface hover:brightness-105 active:brightness-95",
  link: "font-semibold text-primary-text underline-offset-4 hover:underline",
};

// 40, 48 and 56 px tall, with 12, 14 and 16 px corners (PIN-160).
const sizes: Record<Size, string> = {
  sm: "h-10 gap-1.5 rounded-xl px-4 text-sm",
  md: "h-12 gap-2 rounded-btn px-5 text-[15px]",
  lg: "h-14 gap-2.5 rounded-2xl px-6 text-[17px]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: Size;
  /** Shows a spinner and blocks clicks, keeping the label for screen readers. */
  busy?: boolean;
  fullWidth?: boolean;
  /**
   * A stable id for the activity log (ADR 020), such as "recipe.remix": every press is logged under it (written as
   * `data-track`, read by ActivityTracker). Use the mobile app's id when the action is the same. Never put anything
   * a person typed, a title or an email in it. A press without one is logged as "unnamed".
   */
  trackId?: string;
};

export const buttonClasses = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  className,
}: Pick<ButtonProps, "variant" | "size" | "fullWidth" | "className">) =>
  cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap transition-[filter,background-color,color,box-shadow] duration-150",
    "disabled:pointer-events-none disabled:opacity-50",
    variant === "link" ? "h-auto gap-1.5 rounded-md px-1 py-0.5 text-sm" : sizes[size],
    variants[variant],
    fullWidth && "w-full",
    className,
  );

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", busy = false, fullWidth = false, className, children, disabled, type = "button", trackId, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      data-track={trackId}
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
    >
      {busy ? (
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
});

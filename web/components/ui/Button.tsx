import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "outline" | "link";

const styles: Record<Variant, string> = {
  primary:
    "w-full rounded-full bg-primary px-5 py-3 text-base font-semibold text-surface hover:opacity-90 disabled:bg-border disabled:text-muted",
  outline:
    "w-full rounded-full border border-border bg-surface px-5 py-3 text-base font-semibold text-text hover:bg-primary-soft disabled:opacity-60",
  link: "px-1 py-1 text-sm font-semibold text-primary underline-offset-4 hover:underline disabled:opacity-60",
};

export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${styles[variant]} ${className}`}
    >
      {busy ? (
        <span aria-hidden className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      {children}
    </button>
  );
}

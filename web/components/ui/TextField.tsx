import { useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export function TextField({
  label,
  hint,
  error,
  invalid = false,
  trailing,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  /** Shown under the field and read out with it. */
  error?: string;
  invalid?: boolean;
  /** A control inside the field's end, e.g. show/hide password. */
  trailing?: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const isInvalid = invalid || Boolean(error);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={isInvalid || undefined}
          aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
          {...props}
          className={cn(
            "h-12 w-full rounded-btn border bg-surface px-4 text-base text-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] placeholder:text-muted/80",
            "hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60",
            isInvalid ? "border-danger focus:border-danger focus:ring-danger/15" : "border-border",
            trailing ? "pe-24" : undefined,
            className,
          )}
        />
        {trailing ? <div className="absolute inset-y-0 end-1.5 flex items-center">{trailing}</div> : null}
      </div>
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

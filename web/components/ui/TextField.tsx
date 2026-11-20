import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export function TextField({
  label,
  hint,
  invalid = false,
  trailing,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  invalid?: boolean;
  /** A control inside the field's end, e.g. show/hide password. */
  trailing?: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          {...props}
          className={`w-full rounded-2xl border bg-surface px-4 py-3 text-base text-text placeholder:text-muted focus:outline-2 focus:outline-offset-1 focus:outline-primary ${
            invalid ? "border-red-500" : "border-border"
          } ${trailing ? "pe-24" : ""} ${className}`}
        />
        {trailing ? <div className="absolute inset-y-0 end-2 flex items-center">{trailing}</div> : null}
      </div>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

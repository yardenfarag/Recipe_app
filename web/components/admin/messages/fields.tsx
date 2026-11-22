"use client";

import { useId, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Chip as KitChip } from "@/components/ui/Chip";
import { Tile } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";

/** A titled part of the composer, with an optional line under the title. */
export function Section({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  return (
    <Tile as="section" className="p-5">
      {title ? <h2 className="text-base font-bold text-text">{title}</h2> : null}
      {hint ? <p className="mt-1 text-sm leading-relaxed text-muted">{hint}</p> : null}
      <div className={cn("flex flex-col gap-4", title || hint ? "mt-4" : "")}>{children}</div>
    </Tile>
  );
}

function Errors({ id, errors }: { id: string; errors: readonly string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul id={id} className="flex flex-col gap-0.5">
      {errors.map((message) => (
        <li key={message} className="text-sm font-medium text-danger">
          {message}
        </li>
      ))}
    </ul>
  );
}

const inputClass =
  "w-full rounded-btn border bg-surface px-4 text-[15px] text-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-50";

/**
 * A labelled text box (one line, or several with `lines`), its hint, and the form's errors for it, read out with it.
 * `rtl` types right to left, for Hebrew and Arabic words.
 */
export function FormText({
  label,
  hint,
  errors = [],
  required,
  value,
  onChange,
  lines,
  rtl,
  placeholder,
  disabled,
  inputMode,
  type = "text",
}: {
  label: string;
  hint?: string;
  errors?: readonly string[];
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  lines?: number;
  rtl?: boolean;
  placeholder?: string;
  disabled?: boolean;
  inputMode?: "numeric" | "url" | "text";
  type?: "text" | "url";
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-errors`;
  const invalid = errors.length > 0;
  const described = [hint ? hintId : null, invalid ? errorId : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    value,
    placeholder,
    disabled,
    dir: rtl ? ("rtl" as const) : undefined,
    "aria-invalid": invalid || undefined,
    "aria-describedby": described,
    "aria-required": required || undefined,
    className: cn(inputClass, invalid ? "border-danger" : "border-border", lines ? "min-h-24 resize-y py-2.5" : "h-11"),
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </label>
      {lines ? (
        <textarea {...common} rows={lines} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input {...common} type={type} inputMode={inputMode} autoComplete="off" onChange={(e) => onChange(e.target.value)} />
      )}
      <Errors id={errorId} errors={errors} />
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** A label over a set of choices (chips), with its hint and errors. */
export function FormGroup({
  label,
  hint,
  errors = [],
  children,
}: {
  label: string;
  hint?: string;
  errors?: readonly string[];
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={hint ? `${id}-hint` : undefined} className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-sm font-semibold text-text">
        {label}
      </span>
      {children}
      <Errors id={`${id}-errors`} errors={errors} />
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Chip({
  pressed,
  onClick,
  disabled,
  trackId,
  label,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  trackId: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <KitChip
      size="sm"
      selected={pressed}
      aria-label={label}
      disabled={disabled}
      trackId={trackId}
      onClick={onClick}
      className="disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </KitChip>
  );
}

export type ChipOption<T extends string> = { value: T; label: string };

/** Pick one. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  trackPrefix,
  disabled,
}: {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
  trackPrefix: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Chip
          key={option.value}
          pressed={option.value === value}
          disabled={disabled}
          trackId={`${trackPrefix}.${option.value}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}

/** Pick any number; none picked means "don't narrow by this". */
export function MultiChipRow<T extends string>({
  options,
  value,
  onChange,
  trackPrefix,
}: {
  options: readonly ChipOption<T>[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  trackPrefix: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value.includes(option.value);
        return (
          <Chip
            key={option.value}
            pressed={on}
            trackId={`${trackPrefix}.${option.value}`}
            onClick={() => onChange(on ? value.filter((v) => v !== option.value) : [...value, option.value])}
          >
            {option.label}
          </Chip>
        );
      })}
    </div>
  );
}

export { Chip };

/** An on/off setting with what it does. A real switch for screen readers. */
export function FormSwitch({
  label,
  hint,
  checked,
  onChange,
  disabled,
  trackId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  trackId: string;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <Button
      role="switch"
      variant="outline"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      disabled={disabled}
      trackId={trackId}
      onClick={() => onChange(!checked)}
      className="h-auto w-full items-start justify-between gap-4 rounded-2xl px-4 py-3 text-start font-normal whitespace-normal"
    >
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-[15px] font-semibold text-text">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="mt-0.5 block text-sm leading-relaxed text-muted">
            {hint}
          </span>
        ) : null}
      </span>
      <span aria-hidden className={cn("mt-0.5 flex h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors", checked ? "justify-end bg-primary" : "justify-start bg-border")}>
        <span className="h-6 w-6 rounded-full bg-surface shadow-soft" />
      </span>
    </Button>
  );
}

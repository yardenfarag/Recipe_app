"use client";

import { Check, CircleAlert, X } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";
import type { SaveStatus } from "@/lib/settings/useKitchenSettings";

/** One group of settings: a heading, an optional line under it, and its controls. */
export function SettingsCard({
  title,
  hint,
  children,
  tone = "default",
  className,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rounded-3xl border bg-surface/80 p-5 shadow-soft backdrop-blur-sm sm:p-6",
        tone === "danger" ? "border-danger/40" : "border-frosted-border",
        className,
      )}
    >
      <h2 id={id} className={cn("text-base font-bold", tone === "danger" ? "text-danger" : "text-text")}>
        {title}
      </h2>
      {hint ? <p className="mt-1 max-w-2xl text-sm leading-relaxed text-pretty text-muted">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A smaller heading inside a card, for a second group of controls. */
export function SubHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mb-2 text-xs font-bold tracking-wide text-muted uppercase">
      {children}
    </h3>
  );
}

const chipBase =
  "inline-flex min-h-10 shrink-0 select-none items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45";
const chipOff = "border-border bg-surface text-text hover:bg-element";
const chipOn = "border-primary bg-primary-soft text-primary";

/** A choice that is on or off (a diet, an allergy), pressed like a toggle button. */
export function ToggleChip({
  pressed,
  onToggle,
  disabled,
  children,
}: {
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="button" aria-pressed={pressed} disabled={disabled} onClick={onToggle} className={cn(chipBase, pressed ? chipOn : chipOff)}>
      {pressed ? <Check aria-hidden className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

/** Something the cook typed in (an allergy, a pantry staple), with a button to take it off. */
export function RemovableChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { t } = useTranslation();
  return (
    <span className={cn(chipBase, chipOn, "pe-1.5")}>
      <bdi>{label}</bdi>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("a11y.removeItem", { item: label })}
        className="grid h-7 w-7 place-items-center rounded-full transition-colors hover:bg-primary/15"
      >
        <X aria-hidden className="h-4 w-4" />
      </button>
    </span>
  );
}

/**
 * An on/off setting with its name and what it does. A real switch for screen readers; the knob sits at the end
 * when on, in either writing direction.
 */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-4 rounded-2xl border border-border bg-surface px-4 py-3.5 text-start transition-colors hover:bg-surface-soft"
    >
      <span className="min-w-0 flex-1">
        <span id={labelId} className="block text-[15px] font-semibold text-text">
          {label}
        </span>
        {hint ? (
          <span id={hintId} className="mt-1 block text-sm leading-relaxed text-muted">
            {hint}
          </span>
        ) : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-7 w-12 shrink-0 rounded-full p-0.5 transition-colors",
          checked ? "justify-end bg-primary" : "justify-start bg-border",
        )}
      >
        <span className="h-6 w-6 rounded-full bg-surface shadow-soft" />
      </span>
    </button>
  );
}

export type ChoiceOption<T extends string> = {
  value: T;
  /** The option's name for screen readers (and its text when there is no `content`). */
  label: string;
  content?: ReactNode;
  /** The language the label is in, when it isn't the page's (a language's own name). */
  lang?: string;
};

/**
 * Pick one of a few (light or dark, a language). A radio group: Tab reaches the chosen one and the arrow keys move
 * between them, the way they point on screen in either writing direction.
 */
export function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
  optionClassName,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (next: T) => void;
  className?: string;
  /** Classes for each option; `data-checked` is set on the chosen one. */
  optionClassName?: string;
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 };
    const step = steps[event.key];
    if (step == null) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    buttons.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className={className}>
      {options.map((option, index) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={option.content ? option.label : undefined}
            lang={option.lang}
            tabIndex={index === selectedIndex ? 0 : -1}
            data-checked={on || undefined}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={optionClassName}
          >
            {option.content ?? option.label}
          </button>
        );
      })}
    </div>
  );
}

/** A text box for a few lines, styled like TextField. */
export function TextArea({ label, hint, className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-text">
        {label}
      </label>
      <textarea
        id={id}
        aria-describedby={hintId}
        {...props}
        className={cn(
          "min-h-32 w-full resize-y rounded-2xl border border-border bg-surface px-4 py-3 text-base text-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] placeholder:text-muted/80",
          "hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15 disabled:opacity-60",
          className,
        )}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** "Saving…", "Saved" or "Couldn't save", read out politely. Preferences save on every change, so there is no Save button. */
export function SaveStatusLine({ status }: { status: SaveStatus }) {
  const { t } = useTranslation();
  return (
    <p role="status" className="flex min-h-9 items-center gap-1.5 text-sm font-semibold">
      {status === "saving" ? <span className="text-muted">{t("web.settings.saving")}</span> : null}
      {status === "saved" ? (
        <span className="flex items-center gap-1.5 text-success">
          <Check aria-hidden className="h-4 w-4" />
          {t("web.settings.saved")}
        </span>
      ) : null}
      {status === "failed" ? (
        <span className="flex items-center gap-1.5 text-danger">
          <CircleAlert aria-hidden className="h-4 w-4" />
          {t("settings.kitchenSaveFailed")}
        </span>
      ) : null}
    </p>
  );
}

/** A short text box and an Add button, for typing in an item (Enter adds it too). */
export function AddItemField({
  label,
  value,
  onChange,
  onAdd,
  maxLength,
  addLabel,
}: {
  /** Also the placeholder: the box is self-explanatory inside its card. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  maxLength?: number;
  addLabel?: string;
}) {
  const { t } = useTranslation();
  const empty = !value.trim();
  return (
    <form
      aria-label={label}
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!empty) onAdd();
      }}
    >
      <input
        type="text"
        aria-label={label}
        placeholder={label}
        value={value}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-[15px] text-text transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15"
      />
      <button
        type="submit"
        disabled={empty}
        className="inline-flex h-11 shrink-0 items-center rounded-full bg-primary-soft px-5 text-sm font-semibold text-primary transition-[filter] hover:brightness-97 disabled:opacity-45"
      >
        {addLabel ?? t("avoid.add")}
      </button>
    </form>
  );
}

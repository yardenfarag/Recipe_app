"use client";

import { Check, CircleAlert, X } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type ReactNode, type TextareaHTMLAttributes } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/Button";
import { Chip, chipClasses } from "@/components/ui/Chip";
import { Tile, TileLabel } from "@/components/ui/Tile";
import { cn } from "@/lib/cn";
import type { SaveStatus } from "@/lib/settings/useKitchenSettings";

/** One group of settings as a tile: a heading, an optional line under it, and its controls. */
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
    <Tile as="section" aria-labelledby={id} className={cn("p-5 sm:p-6", tone === "danger" && "border-danger/40", className)}>
      <h2 id={id} className={cn("text-xl font-bold", tone === "danger" ? "text-danger" : "text-text")}>
        {title}
      </h2>
      {hint ? <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-pretty text-muted">{hint}</p> : null}
      <div className="mt-5">{children}</div>
    </Tile>
  );
}

/** A small-caps heading inside a card, for a second group of controls. */
export function SubHeading({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <TileLabel as="h3" id={id} className="mb-2.5">
      {children}
    </TileLabel>
  );
}

/**
 * The look of a two- or three-way choice drawn by ChoiceGroup, matching the kit's SegmentedControl. For choices
 * whose names are too long for that one on a phone: here they shorten or wrap instead of running off the tile.
 */
export const segmentedGroupClass = "grid gap-1 rounded-btn bg-element p-1";
export const segmentedOptionClass =
  "flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-[10px] px-3 py-1.5 text-center text-sm font-semibold text-muted transition-colors hover:text-text data-[checked]:bg-surface data-[checked]:text-text data-[checked]:shadow-soft";

/** The look of one option in a list drawn by ChoiceGroup (a language): a block in the tile, ringed when chosen. */
export const optionRowClass =
  "group flex min-h-14 items-center gap-3 rounded-2xl bg-element px-4 py-3 text-start transition-colors hover:bg-selected data-[checked]:ring-2 data-[checked]:ring-primary data-[checked]:ring-inset";

/** A kit chip as a ChoiceGroup option: filled when chosen, like `<Chip kind="radio" selected>`. */
export const choiceChipClass = cn(
  chipClasses(),
  "data-[checked]:border-text data-[checked]:bg-text data-[checked]:text-bg data-[checked]:hover:bg-text data-[checked]:active:bg-text",
);

/** A one-line text box with no label above it (it has an `aria-label`), shaped like TextField. */
export const inputClass =
  "h-12 w-full min-w-0 rounded-btn border border-border bg-surface px-4 text-base text-text transition-[border-color,box-shadow] placeholder:text-muted/80 hover:border-muted/60 focus:border-primary focus:ring-4 focus:ring-primary/15";

/** A choice that is on or off (a diet, an allergy), pressed like a toggle button. */
export function ToggleChip({
  pressed,
  onToggle,
  disabled,
  children,
  trackId,
}: {
  pressed: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: ReactNode;
  /** An id for the activity log (ADR 020); never anything the person typed. */
  trackId?: string;
}) {
  return (
    <Chip selected={pressed} disabled={disabled} onClick={onToggle} trackId={trackId} className="disabled:pointer-events-none disabled:opacity-45">
      {pressed ? <Check aria-hidden className="h-4 w-4" /> : null}
      {children}
    </Chip>
  );
}

/** Something the cook typed in (an allergy, a pantry staple), with a button to take it off. */
export function RemovableChip({ label, onRemove, trackId }: { label: string; onRemove: () => void; trackId?: string }) {
  const { t } = useTranslation();
  return (
    // A soft fill, so a row of them reads as a list, not as chosen filters. A long name wraps instead of running off a phone.
    <span
      className={chipClasses({
        className:
          "h-auto min-h-10 max-w-full shrink gap-1 border-transparent bg-element py-1 pe-1 whitespace-normal hover:bg-element pointer-coarse:h-auto pointer-coarse:min-h-11 pointer-coarse:pe-0",
      })}
    >
      <bdi className="min-w-0 break-words">{label}</bdi>
      <button
        type="button"
        data-track={trackId}
        onClick={onRemove}
        aria-label={t("a11y.removeItem", { item: label })}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-selected hover:text-text pointer-coarse:h-11 pointer-coarse:w-11"
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
  trackId,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  /** An id for the activity log (ADR 020). */
  trackId?: string;
}) {
  const labelId = useId();
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      data-track={trackId}
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={hint ? hintId : undefined}
      onClick={() => onChange(!checked)}
      className="flex min-h-14 w-full items-start gap-4 rounded-2xl bg-element px-4 py-3.5 text-start transition-colors hover:bg-selected"
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
          checked ? "justify-end bg-primary" : "justify-start bg-text/25",
        )}
      >
        <span className={cn("h-6 w-6 rounded-full", checked ? "bg-on-primary" : "bg-surface")} />
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
  trackId,
}: {
  label: string;
  value: T;
  options: ChoiceOption<T>[];
  onChange: (next: T) => void;
  className?: string;
  /** Classes for each option; `data-checked` is set on the chosen one. */
  optionClassName?: string;
  /** An id for the activity log (ADR 020); each option logs `<trackId>.<value>`, so values must be fixed keys. */
  trackId?: string;
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
            data-track={trackId ? `${trackId}.${option.value}` : undefined}
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
          "min-h-32 w-full resize-y rounded-btn border border-border bg-surface px-4 py-3 text-base text-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] placeholder:text-muted/80",
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
  trackId,
}: {
  /** Also the placeholder: the box is self-explanatory inside its card. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  maxLength?: number;
  addLabel?: string;
  /** An id for the activity log (ADR 020), on the Add button. */
  trackId?: string;
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
        className={cn(inputClass, "flex-1")}
      />
      <Button type="submit" variant="secondary" trackId={trackId} disabled={empty}>
        {addLabel ?? t("avoid.add")}
      </Button>
    </form>
  );
}

"use client";

import { RotateCcw, UserPen } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { EditorMessage } from "@shared/lib/recipeEditor";

import { cn } from "@/lib/cn";

/** Translates an editor message (an i18n key and its numbers), or null. */
export function useEditorMessage() {
  const { t } = useTranslation();
  return (message: EditorMessage | undefined | null): string | null =>
    message ? t(message.key, message.params as Record<string, unknown> | undefined) : null;
}

/** The look of every text box in the editor, so rows, fields and the title line up. */
export function inputClasses(invalid: boolean, className?: string) {
  return cn(
    "w-full min-w-0 rounded-xl border bg-surface px-3 text-[15px] text-text shadow-[inset_0_1px_2px_rgb(0_0_0/0.03)] transition-[border-color,box-shadow] placeholder:text-muted/70",
    "hover:border-muted/60 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-60",
    invalid ? "border-danger focus:border-danger focus:ring-danger/15" : "border-border",
    className,
  );
}

/** One part of the form: a heading, an optional line under it, an optional control at its end. */
export function EditorCard({
  title,
  hint,
  action,
  children,
  className,
  id,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("scroll-mt-24 rounded-3xl border border-frosted-border bg-surface/85 p-4 shadow-soft backdrop-blur-sm sm:p-6", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-bold text-text">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-sm leading-relaxed text-pretty text-muted">{hint}</p> : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A message under a field or row, tied to it with aria-describedby through `id`. */
export function FieldMessage({ id, message }: { id: string; message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm font-medium text-danger">
      {message}
    </p>
  );
}

/**
 * "Set by you", with the way back to Pinch's own estimate (ADR 018): a value the cook typed is never overwritten by a
 * recalculation until they reset it.
 */
export function LockedNote({ onReset, field }: { onReset: () => void; field: string }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 font-semibold text-primary">
        <UserPen aria-hidden className="h-3.5 w-3.5" />
        {t("recipeEditor.locked.setByYou")}
      </span>
      <button
        type="button"
        data-track="recipe_editor.field.reset"
        onClick={onReset}
        aria-label={`${t("recipeEditor.locked.reset")}: ${field}`}
        className="inline-flex items-center gap-1 rounded-full px-1 py-0.5 font-semibold text-muted underline-offset-2 hover:text-text hover:underline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <RotateCcw aria-hidden className="h-3.5 w-3.5" />
        {t("recipeEditor.locked.reset")}
      </button>
    </span>
  );
}

/** A label with room at its end for "Set by you". */
export function FieldLabel({ htmlFor, id, children, end }: { htmlFor?: string; id?: string; children: ReactNode; end?: ReactNode }) {
  return (
    <div className="mb-1.5 flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      {htmlFor ? (
        <label htmlFor={htmlFor} id={id} className="text-sm font-semibold text-text">
          {children}
        </label>
      ) : (
        <span id={id} className="text-sm font-semibold text-text">
          {children}
        </span>
      )}
      {end}
    </div>
  );
}

/** "112 / 120" once a field gets close to its limit, so the cook isn't surprised by the error. */
export function CharCount({ length, max }: { length: number; max: number }) {
  if (length < max * 0.8) return null;
  return (
    <span aria-hidden className={cn("text-xs tabular-nums", length > max ? "font-semibold text-danger" : "text-muted")}>
      {length} / {max}
    </span>
  );
}

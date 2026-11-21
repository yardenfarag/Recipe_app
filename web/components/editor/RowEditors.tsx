"use client";

import { Trash2 } from "lucide-react";
import type { ClipboardEvent, KeyboardEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { IngredientRow, IngredientRowErrors, StepRow } from "@shared/lib/recipeEditor";
import { RECIPE_LIMITS } from "@shared/lib/recipeLimits";

import { CharCount, inputClasses, useEditorMessage } from "@/components/editor/parts";
import { IconButton } from "@/components/ui/IconButton";
import { ingredientFieldId, stepFieldId, type IngredientPart } from "@/lib/editor/fieldIds";

/** Enter with no modifier, and not while an input method is composing a character. */
export const isPlainEnter = (event: KeyboardEvent) =>
  event.key === "Enter" && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing;

type IngredientRowEditorProps = {
  row: IngredientRow;
  index: number;
  handle: ReactNode;
  errors?: IngredientRowErrors;
  onChange: (patch: Partial<Pick<IngredientRow, "name" | "quantity" | "unit">>) => void;
  onRemove: () => void;
  /** Enter in any field: the next row (a new one after this). */
  onEnter: () => void;
  /** Backspace in an empty field of a blank row: remove the row. Returns false when it can't (the last row). */
  onRemoveBlank: () => boolean;
  /** A paste of several lines: one row each. Returns true when it took the paste. */
  onPasteLines: (text: string) => boolean;
};

/**
 * Grip · amount · unit · ingredient · delete. Tab goes through the fields in reading order; Enter opens the next row;
 * Backspace in an empty row removes it.
 */
export function IngredientRowEditor({
  row,
  index,
  handle,
  errors,
  onChange,
  onRemove,
  onEnter,
  onRemoveBlank,
  onPasteLines,
}: IngredientRowEditorProps) {
  const { t } = useTranslation();
  const format = useEditorMessage();
  const message = format(errors?.row) ?? format(errors?.name) ?? format(errors?.quantity);
  const messageId = `${ingredientFieldId(row.id, "name")}-error`;
  const blank = !row.name.trim() && !row.quantity.trim() && !row.unit.trim();
  const rowLabel = row.name.trim() || t("web.editor.ingredientN", { n: index + 1 });

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (isPlainEnter(event)) {
      event.preventDefault();
      onEnter();
      return;
    }
    if (event.key === "Backspace" && blank && event.currentTarget.value === "" && onRemoveBlank()) {
      event.preventDefault();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLInputElement>) {
    // A photo is the page's to take; several lines become several rows.
    if (event.clipboardData.files.length > 0) return;
    if (onPasteLines(event.clipboardData.getData("text/plain"))) event.preventDefault();
  }

  const field = (part: IngredientPart, invalid: boolean) => ({
    id: ingredientFieldId(row.id, part),
    onKeyDown,
    onPaste,
    "aria-invalid": invalid || undefined,
    "aria-describedby": invalid ? messageId : undefined,
    autoComplete: "off",
  });

  return (
    <div className="border-b border-border/60 pb-2.5 sm:border-0 [li:last-child>&]:border-0 sm:py-0.5">
      {/* Phones: amount and unit on top, the ingredient under them, so its name has room. Wider: one line. */}
      <div className="grid grid-cols-[2rem_4.5rem_minmax(0,1fr)_2.5rem] items-start gap-1.5 sm:flex sm:gap-2">
        <span className="row-span-2 sm:row-span-1">{handle}</span>
        <input
          {...field("quantity", Boolean(errors?.quantity))}
          value={row.quantity}
          onChange={(event) => onChange({ quantity: event.target.value })}
          placeholder={t("recipeEditor.placeholders.quantity")}
          aria-label={`${t("recipeEditor.fields.quantity")}, ${rowLabel}`}
          inputMode="decimal"
          enterKeyHint="next"
          className={inputClasses(Boolean(errors?.quantity), "h-11 text-center tabular-nums sm:w-20")}
        />
        <input
          {...field("unit", false)}
          value={row.unit}
          onChange={(event) => onChange({ unit: event.target.value })}
          // Only as an example on a new row: on a filled one ("4 garlic cloves") a grey "g" reads as grams.
          placeholder={blank ? t("recipeEditor.placeholders.unit") : undefined}
          aria-label={`${t("recipeEditor.fields.unit")}, ${rowLabel}`}
          dir="auto"
          autoCapitalize="none"
          enterKeyHint="next"
          className={inputClasses(false, "h-11 sm:w-24")}
        />
        <input
          {...field("name", Boolean(errors?.name || errors?.row))}
          value={row.name}
          onChange={(event) => onChange({ name: event.target.value })}
          placeholder={t("recipeEditor.placeholders.ingredientName")}
          aria-label={t("web.editor.ingredientN", { n: index + 1 })}
          dir="auto"
          enterKeyHint="next"
          className={inputClasses(Boolean(errors?.name || errors?.row), "col-start-2 col-end-5 row-start-2 h-11 sm:flex-1")}
        />
        <IconButton
          label={t("a11y.removeItem", { item: rowLabel })}
          trackId="recipe_editor.ingredient.remove"
          icon={<Trash2 className="h-[18px] w-[18px]" />}
          onClick={onRemove}
          className="col-start-4 row-start-1 h-11 w-10 hover:bg-danger-soft hover:text-danger"
        />
      </div>
      {message ? (
        <p id={messageId} className="mt-1 ms-10 text-sm font-medium text-danger">
          {message}
        </p>
      ) : null}
    </div>
  );
}

type StepRowEditorProps = {
  row: StepRow;
  position: number;
  handle: ReactNode;
  error?: string | null;
  onChange: (text: string) => void;
  onRemove: () => void;
  onEnter: () => void;
  onRemoveBlank: () => boolean;
  onPasteLines: (text: string) => boolean;
};

/** Grip · number · the step's text (grows as it fills) · delete. Enter starts the next step, Shift+Enter a new line. */
export function StepRowEditor({ row, position, handle, error, onChange, onRemove, onEnter, onRemoveBlank, onPasteLines }: StepRowEditorProps) {
  const { t } = useTranslation();
  const id = stepFieldId(row.id);
  const errorId = `${id}-error`;
  const label = t("recipeEditor.fields.step", { n: position });
  const length = Array.from(row.text.trim()).length;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isPlainEnter(event)) {
      event.preventDefault();
      onEnter();
      return;
    }
    if (event.key === "Backspace" && !row.text.trim() && event.currentTarget.value === "" && onRemoveBlank()) {
      event.preventDefault();
    }
  }

  return (
    <div className="py-0.5">
      <div className="flex items-start gap-1.5 sm:gap-2">
        {handle}
        <span
          aria-hidden
          className="mt-2 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary tabular-nums"
        >
          {position}
        </span>
        <div className="min-w-0 flex-1">
          <textarea
            id={id}
            value={row.text}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={onKeyDown}
            onPaste={(event) => {
              if (event.clipboardData.files.length > 0) return;
              if (onPasteLines(event.clipboardData.getData("text/plain"))) event.preventDefault();
            }}
            placeholder={t("recipeEditor.placeholders.step")}
            dir="auto"
            aria-label={label}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={error ? errorId : undefined}
            rows={2}
            enterKeyHint="next"
            className={inputClasses(Boolean(error), "field-sizing-content block min-h-[4.25rem] resize-y py-2.5 leading-relaxed")}
          />
          <div className="flex items-start justify-between gap-3">
            {error ? (
              <p id={errorId} className="mt-1 text-sm font-medium text-danger">
                {error}
              </p>
            ) : (
              <span />
            )}
            <span className="mt-1">
              <CharCount length={length} max={RECIPE_LIMITS.stepChars} />
            </span>
          </div>
        </div>
        <IconButton
          label={t("a11y.removeItem", { item: label })}
          trackId="recipe_editor.step.remove"
          icon={<Trash2 className="h-[18px] w-[18px]" />}
          onClick={onRemove}
          className="h-11 w-10 hover:bg-danger-soft hover:text-danger"
        />
      </div>
    </div>
  );
}

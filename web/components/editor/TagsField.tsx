"use client";

import { useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { RECIPE_LIMITS } from "@shared/lib/recipeLimits";
import { translateRecipeTag } from "@shared/lib/recipeTags";

import { inputClasses } from "@/components/editor/parts";
import { RemovableChip } from "@/components/settings/controls";
import { FIELD_IDS } from "@/lib/editor/fieldIds";

/**
 * The recipe's tags as chips, and a box to type more: Enter or a comma adds one, Backspace in the empty box takes the
 * last one off. Several can be pasted at once, separated by commas.
 */
export function TagsField({
  tags,
  error,
  labelId,
  onAdd,
  onRemove,
}: {
  tags: string[];
  error: string | null;
  labelId: string;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
}) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const full = tags.length >= RECIPE_LIMITS.tags;
  const hintId = `${FIELD_IDS.tags}-hint`;
  const errorId = `${FIELD_IDS.tags}-error`;

  function commit(text: string) {
    for (const part of text.split(",")) {
      if (part.trim()) onAdd(part);
    }
    setInput("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if ((event.key === "Enter" || event.key === ",") && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (input.trim()) commit(input);
      return;
    }
    if (event.key === "Backspace" && input === "" && tags.length > 0) {
      event.preventDefault();
      onRemove(tags[tags.length - 1]);
    }
  }

  return (
    <div>
      {tags.length > 0 ? (
        <ul aria-labelledby={labelId} className="mb-3 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag}>
              <RemovableChip label={translateRecipeTag(tag, t)} onRemove={() => onRemove(tag)} />
            </li>
          ))}
        </ul>
      ) : null}
      <input
        id={FIELD_IDS.tags}
        value={input}
        onChange={(event) => {
          const value = event.target.value;
          // A pasted "dinner, quick" lands as two tags.
          if (value.includes(",")) commit(value);
          else setInput(value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (input.trim()) commit(input);
        }}
        disabled={full}
        placeholder={t("recipeEditor.placeholders.tag")}
        dir="auto"
        aria-labelledby={labelId}
        aria-describedby={[error ? errorId : hintId].join(" ")}
        aria-invalid={Boolean(error) || undefined}
        autoCapitalize="none"
        autoComplete="off"
        enterKeyHint="done"
        className={inputClasses(Boolean(error), "h-11")}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : (
        <p id={hintId} className="mt-1.5 text-xs text-muted">
          {full ? t("recipeEditor.errors.tooMany", { max: RECIPE_LIMITS.tags }) : t("web.editor.tagsHint")}
        </p>
      )}
    </div>
  );
}

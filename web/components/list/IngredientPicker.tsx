"use client";

import { Check, Home } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "@/lib/cn";
import type { IngredientChoice } from "@/lib/list/ingredientChoices";

export type IngredientSection = { id: string; title?: string; choices: IngredientChoice[] };

/**
 * Tick which ingredients go on the list. Things kept at home start unticked and say so; "I keep this" marks one as
 * kept at home for next time and unticks it. One section per recipe when several are added at once.
 */
export function IngredientPicker({
  sections,
  selected,
  onChange,
  isStaple,
  onKeepStaple,
}: {
  sections: IngredientSection[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  isStaple: (name: string) => boolean;
  onKeepStaple: (choice: IngredientChoice) => void;
}) {
  const { t } = useTranslation();
  const all = sections.flatMap((section) => section.choices);
  const allSelected = all.length > 0 && all.every((choice) => selected.has(choice.key));

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-sm text-muted">
          {t("addToList.selected", { selected: all.filter((choice) => selected.has(choice.key)).length, total: all.length })}
        </p>
        <button
          type="button"
          onClick={() => onChange(allSelected ? new Set() : new Set(all.map((choice) => choice.key)))}
          className="rounded-full px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-soft"
        >
          {t(allSelected ? "addToList.deselectAll" : "addToList.selectAll")}
        </button>
      </div>
      <div className="flex flex-col gap-4">
        {sections.map((section) => (
          <Section key={section.id} section={section} selected={selected} onToggle={toggle} isStaple={isStaple} onKeepStaple={onKeepStaple} />
        ))}
      </div>
    </div>
  );
}

function Section({
  section,
  selected,
  onToggle,
  isStaple,
  onKeepStaple,
}: {
  section: IngredientSection;
  selected: Set<string>;
  onToggle: (key: string) => void;
  isStaple: (name: string) => boolean;
  onKeepStaple: (choice: IngredientChoice) => void;
}) {
  const { t } = useTranslation();
  const headingId = useId();
  return (
    <section aria-labelledby={section.title ? headingId : undefined}>
      {section.title ? (
        <h3 id={headingId} className="mb-1 px-1 text-sm font-bold text-text">
          {section.title}
        </h3>
      ) : null}
      <ul className="flex flex-col">
        {section.choices.map((choice) => {
          const on = selected.has(choice.key);
          const staple = isStaple(choice.name);
          const amount = choice.amount || t("recipe.amountUnknown");
          return (
            <li key={choice.key} className="flex items-center gap-1 border-b border-border last:border-b-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                aria-label={[choice.name, amount, staple ? t("addToList.inPantry") : null].filter(Boolean).join(", ")}
                onClick={() => onToggle(choice.key)}
                className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-xl px-1 py-2 text-start transition-colors hover:bg-element"
              >
                <span
                  aria-hidden
                  className={cn(
                    "grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
                    on ? "border-primary bg-primary text-on-primary" : "border-border",
                  )}
                >
                  {on ? <Check className="h-4 w-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-text [overflow-wrap:anywhere]">{choice.name}</span>
                  {staple ? <span className="block text-xs text-muted">{t("addToList.inPantry")}</span> : null}
                </span>
                <span dir="auto" className={cn("max-w-[45%] shrink text-end text-sm tabular-nums", choice.amount ? "text-muted" : "text-muted/80 italic")}>
                  {amount}
                </span>
              </button>
              {!staple ? (
                <button
                  type="button"
                  onClick={() => onKeepStaple(choice)}
                  aria-label={t("addToList.keepThisLabel", { name: choice.name })}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-accent hover:bg-accent-soft"
                >
                  <Home aria-hidden className="h-3.5 w-3.5" />
                  {t("addToList.keepThis")}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

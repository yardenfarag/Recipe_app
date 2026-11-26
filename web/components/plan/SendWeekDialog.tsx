"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { resolveCulinaryLanguage } from "@shared/lib/culinaryUnits";
import { scaleIngredients } from "@shared/lib/ingredientAmounts";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import { showToast } from "@shared/lib/toast";
import { PLAN_MEALS, type MealPlanEntry } from "@shared/types/mealPlan";
import type { Recipe } from "@shared/types/recipe";

import { useAuth } from "@/components/AuthProvider";
import { useLanguage } from "@/components/LanguageProvider";
import { IngredientPicker, type IngredientSection } from "@/components/list/IngredientPicker";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { ingredientChoices } from "@/lib/list/ingredientChoices";
import { addToShoppingList } from "@/lib/list/shoppingListSync";
import { usePantryStaples } from "@/lib/list/usePantryStaples";
import { selectionWithoutHome } from "@/lib/plan/planModel";
import { useMeasurementSystem } from "@/lib/recipe/useMeasurementSystem";
import { useUnitSystem } from "@/lib/recipe/useUnitSystem";

/**
 * "Send to list": the ingredients of every meal still to cook, at the servings planned, with what is at home left
 * unticked. Leftovers add nothing. The same ingredient from two recipes stacks into one line on the list.
 */
export function SendWeekDialog({
  open,
  onOpenChange,
  entries,
  recipeFor,
  dayLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entries: MealPlanEntry[];
  recipeFor: (entry: MealPlanEntry) => Recipe | null;
  dayLabel: (date: string) => string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <Body entries={entries} recipeFor={recipeFor} dayLabel={dayLabel} onDone={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function Body({
  entries,
  recipeFor,
  dayLabel,
  onDone,
}: {
  entries: MealPlanEntry[];
  recipeFor: (entry: MealPlanEntry) => Recipe | null;
  dayLabel: (date: string) => string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { language } = useLanguage();
  const { system } = useMeasurementSystem();
  const { units } = useUnitSystem();
  const { staples, isStaple, keepStaple } = usePantryStaples();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sections: IngredientSection[] = useMemo(
    () =>
      entries
        .filter((entry) => !entry.leftoverOf && !entry.cookedAt)
        .sort((a, b) => a.date.localeCompare(b.date) || PLAN_MEALS.indexOf(a.meal) - PLAN_MEALS.indexOf(b.meal))
        .flatMap((entry) => {
          const recipe = recipeFor(entry);
          if (!recipe) return [];
          const ingredients = scaleIngredients(recipe.ingredients ?? [], recipe.servings, entry.servings);
          const choices = ingredientChoices(ingredients, {
            system,
            unitLanguage: resolveCulinaryLanguage(resolveRecipeSourceLanguage(recipe), language),
            recipeId: recipe.id,
            keyPrefix: entry.id,
            units,
          });
          return choices.length > 0
            ? [{ id: entry.id, title: `${dayLabel(entry.date)} · ${t(`plan.meals.${entry.meal}`)} · ${recipe.display_title?.trim() || recipe.title}`, choices }]
            : [];
        }),
    [dayLabel, entries, language, recipeFor, system, t, units],
  );
  const allChoices = useMemo(() => sections.flatMap((section) => section.choices), [sections]);
  const [selection, setSelection] = useState<Set<string> | null>(null);
  // Ticked once what is at home is known: everything but that.
  const selected = selection ?? (staples ? selectionWithoutHome(allChoices, staples) : new Set<string>());
  const count = allChoices.filter((choice) => selected.has(choice.key)).length;

  async function send() {
    if (!user) return;
    setBusy(true);
    setError(null);
    try {
      await addToShoppingList(
        user.id,
        allChoices.filter((choice) => selected.has(choice.key)).map((choice) => choice.item),
        "merge",
      );
      showToast(t("plan.send.done"));
      onDone();
    } catch {
      setError(t("plan.send.failed"));
      setBusy(false);
    }
  }

  return (
    <DialogContent
      title={t("plan.send.title")}
      description={sections.length > 0 ? t("plan.send.hint") : undefined}
      className="max-w-2xl"
      footer={
        <>
          <DialogClose asChild>
            <Button variant="ghost" trackId="plan.send.cancel" disabled={busy}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button trackId="plan.send.add" busy={busy} disabled={count === 0 || staples == null} onClick={() => void send()}>
            {t("plan.send.add")}
          </Button>
        </>
      }
    >
      {sections.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted">{t("plan.send.nothing")}</p>
      ) : (
        <div className="-mx-2 max-h-[min(60dvh,32rem)] overflow-y-auto px-2">
          <IngredientPicker
            sections={sections}
            selected={selected}
            onChange={setSelection}
            isStaple={isStaple}
            onKeepStaple={(choice) => {
              const next = new Set(selected);
              for (const other of allChoices) if (other.name.trim().toLowerCase() === choice.name.trim().toLowerCase()) next.delete(other.key);
              setSelection(next);
              keepStaple(choice.name).catch(() => showToast(t("settings.kitchenSaveFailed"), "error"));
            }}
          />
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </DialogContent>
  );
}

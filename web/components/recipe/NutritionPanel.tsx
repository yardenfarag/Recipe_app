"use client";

import { useId } from "react";
import { useTranslation } from "react-i18next";

import { macroCalorieShares } from "@shared/lib/recipeNutrition";
import type { RecipeNutrition } from "@shared/types/recipe";

import { TileLabel } from "@/components/ui/Tile";

/**
 * One number over what it is, like the facts above it; a screen reader hears "Protein: 30 g". Under a macro, a
 * small meter of its share of the calories in the theme's one colour: its place says which macro it is, so it never
 * depends on telling colours apart. The meter is for the eye only; the grams carry the information.
 */
function Macro({ label, value, share }: { label: string; value: string; share?: number }) {
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <span className="sr-only">{`${label}: ${value}`}</span>
      <span aria-hidden className="font-display text-[22px] leading-none font-bold whitespace-nowrap text-text tabular-nums md:text-[28px]">
        {value}
      </span>
      <span aria-hidden className="min-w-0 text-[11px] leading-snug font-semibold break-words text-muted md:text-xs">
        {label}
      </span>
      {share != null ? (
        <span aria-hidden data-testid="macro-meter" className="mt-1 block h-1.5 rounded-full bg-selected">
          <span className="block h-full min-w-1.5 rounded-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
        </span>
      ) : null}
    </li>
  );
}

/**
 * Calories, protein, carbs and fat for one serving of the recipe as written, as big numbers. Per serving never
 * changes with the servings stepper; the total does, and stays in the ingredients panel.
 */
export function NutritionPanel({ calories, nutrition }: { calories: number; nutrition: RecipeNutrition }) {
  const { t } = useTranslation();
  const headingId = useId();
  const shares = macroCalorieShares(nutrition);
  const grams = (amount: number) => t("recipe.macroGrams", { amount: amount.toLocaleString() });
  return (
    <div
      role="group"
      data-testid="recipe-nutrition"
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-[14px] bg-element px-3.5 py-3 md:rounded-2xl md:px-4 md:py-3.5"
    >
      <TileLabel id={headingId} className="text-[11px] md:text-xs">
        {t("recipe.perServing")}
      </TileLabel>
      <ul className="grid grid-cols-4 items-start gap-2 md:gap-3">
        <Macro label={t("recipe.macroCalories")} value={calories.toLocaleString()} />
        <Macro label={t("recipe.macroProtein")} value={grams(nutrition.protein_g)} share={shares?.protein} />
        <Macro label={t("recipe.macroCarbs")} value={grams(nutrition.carbs_g)} share={shares?.carbs} />
        <Macro label={t("recipe.macroFat")} value={grams(nutrition.fat_g)} share={shares?.fat} />
      </ul>
    </div>
  );
}

import type { FilledMeal, PlannedMeal } from "@shared/lib/mealPlan/fillWeek";
import { portionsByMeal } from "@shared/lib/mealPlan/fillWeek";
import { foodWords, homeCovers } from "@shared/lib/pantry";
import type { NewPlanMeal } from "@shared/lib/supabase/mealPlan";
import type { MealPlanEntry, PlanMeal } from "@shared/types/mealPlan";
import type { Recipe } from "@shared/types/recipe";
import type { RecipeCard } from "@shared/types/recipeCard";

import type { IngredientChoice } from "@/lib/list/ingredientChoices";

export const slotKey = (date: string, meal: PlanMeal) => `${date}|${meal}`;

/**
 * The meals to fill, and the ones a reshuffle replaces. "fill" takes only empty meals; "reshuffle" also takes meals
 * that aren't locked or cooked. Leftovers of a replaced meal are replaced with it (they go when it goes).
 */
export function slotsToFill(
  entries: MealPlanEntry[],
  days: string[],
  meals: PlanMeal[],
  mode: "fill" | "reshuffle",
): { slots: { date: string; meal: PlanMeal }[]; replace: MealPlanEntry[] } {
  const byKey = new Map(entries.map((entry) => [slotKey(entry.date, entry.meal), entry]));
  const replace: MealPlanEntry[] = [];
  const slots: { date: string; meal: PlanMeal }[] = [];
  for (const date of days) {
    for (const meal of meals) {
      const entry = byKey.get(slotKey(date, meal));
      if (!entry) slots.push({ date, meal });
      else if (mode === "reshuffle" && !entry.locked && !entry.cookedAt) {
        replace.push(entry);
        slots.push({ date, meal });
      }
    }
  }
  const replacedIds = new Set(replace.map((entry) => entry.id));
  for (const entry of entries) {
    if (entry.leftoverOf && replacedIds.has(entry.leftoverOf) && !replacedIds.has(entry.id)) {
      replace.push(entry);
      replacedIds.add(entry.id);
      if (days.includes(entry.date) && meals.includes(entry.meal) && !slots.some((s) => s.date === entry.date && s.meal === entry.meal)) {
        slots.push({ date: entry.date, meal: entry.meal });
      }
    }
  }
  return { slots, replace };
}

/** The meals that stay, as the planner sees them. */
export function plannedMeals(entries: MealPlanEntry[], replaced: MealPlanEntry[]): PlannedMeal[] {
  const gone = new Set(replaced.map((entry) => entry.id));
  return entries
    .filter((entry) => !gone.has(entry.id))
    .map((entry) => ({ date: entry.date, meal: entry.meal, candidateId: entry.recipeId, leftover: entry.leftoverOf != null }));
}

/** Hub cards the cook has already saved show up as their own recipe; leave the card out. */
export function hubCardsNotInLibrary(cards: RecipeCard[], recipes: Recipe[]): RecipeCard[] {
  const urls = new Set(recipes.map((recipe) => recipe.original_url).filter((url): url is string => !!url));
  return cards.filter((card) => !urls.has(card.original_url) && !urls.has(card.canonical_url));
}

/**
 * Filled meals as rows to save. A meal that also feeds leftovers is cooked in more servings; `recipeIdFor` turns a
 * Hub card into the Library recipe it was saved as.
 */
export function mealsToSave(
  filled: FilledMeal[],
  recipeIdFor: (candidateId: string) => string | null,
  servings: number,
): NewPlanMeal[] {
  const portions = portionsByMeal(filled);
  return filled.flatMap((meal) => {
    const recipeId = recipeIdFor(meal.candidateId);
    if (!recipeId) return [];
    return [
      {
        date: meal.date,
        meal: meal.meal,
        recipeId,
        servings: Math.min(48, servings * (meal.leftoverOf ? 1 : portions.get(slotKey(meal.date, meal.meal)) ?? 1)),
        leftoverOf: meal.leftoverOf,
      },
    ];
  });
}

/** How much of a recipe is at home: ingredients covered, out of those counted (not water and salt). */
export function haveCount(ingredientNames: string[], homeNames: string[]): { have: number; total: number } {
  const home = homeNames.map(foodWords).filter((words) => words.length > 0);
  let have = 0;
  let total = 0;
  for (const name of ingredientNames) {
    const words = foodWords(name);
    if (words.length === 0 || ["water", "salt"].includes(words.join(" "))) continue;
    total += 1;
    if (home.some((h) => homeCovers(h, words))) have += 1;
  }
  return { have, total };
}

/** Everything ticked except what is at home (the pantry and "Always have"). */
export function selectionWithoutHome(choices: IngredientChoice[], homeNames: string[]): Set<string> {
  const home = homeNames.map(foodWords).filter((words) => words.length > 0);
  return new Set(
    choices
      .filter((choice) => {
        const words = foodWords(choice.name);
        return words.length === 0 || !home.some((h) => homeCovers(h, words));
      })
      .map((choice) => choice.key),
  );
}

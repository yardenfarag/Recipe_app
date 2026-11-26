/**
 * Filling a plan and saving it (PIN-77), the same in both apps. The apps gather what the cook has (recipes, kitchen
 * profile, what's at home, Hub cards) and call fillAndSavePlan; this works out which meals to fill, runs fillWeek,
 * saves Hub picks to the Library (claimHubCard), and writes the result.
 */
import type { AvoidList } from '../avoidList';
import { foodWords, homeCovers } from '../pantry';
import { claimHubCard } from '../supabase/cookingHub';
import { deleteMealPlanEntries, saveMealPlanMeals, type NewPlanMeal } from '../supabase/mealPlan';
import type { MealKind, MealPlanEntry, PlanAdjust, PlanMeal } from '../../types/mealPlan';
import type { Recipe } from '../../types/recipe';
import type { RecipeCard } from '../../types/recipeCard';
import {
  candidateFromCard,
  candidateFromRecipe,
  fillWeek,
  libraryOnlyStatus,
  mealKindOf,
  portionsByMeal,
  type FilledMeal,
  type LibraryOnlyStatus,
  type PlanCandidate,
  type PlanReason,
  type PlannedMeal,
} from './fillWeek';

export const slotKey = (date: string, meal: PlanMeal) => `${date}|${meal}`;

/**
 * The meals to fill, and the ones a reshuffle replaces. "fill" takes only empty meals; "reshuffle" also takes meals
 * that aren't locked or cooked. Leftovers of a replaced meal are replaced with it (they go when it goes).
 */
export function slotsToFill(
  entries: MealPlanEntry[],
  days: string[],
  meals: PlanMeal[],
  mode: 'fill' | 'reshuffle',
): { slots: { date: string; meal: PlanMeal }[]; replace: MealPlanEntry[] } {
  const byKey = new Map(entries.map((entry) => [slotKey(entry.date, entry.meal), entry]));
  const replace: MealPlanEntry[] = [];
  const slots: { date: string; meal: PlanMeal }[] = [];
  for (const date of days) {
    for (const meal of meals) {
      const entry = byKey.get(slotKey(date, meal));
      if (!entry) slots.push({ date, meal });
      else if (mode === 'reshuffle' && !entry.locked && !entry.cookedAt) {
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

/**
 * How much of a recipe is at home: ingredients covered, out of those counted (not water and salt). `otherNames` are
 * the same ingredients in another language, row for row (a saved translation, translatedIngredientNames): an
 * ingredient is at home when either name is.
 */
export function haveCount(
  ingredientNames: string[],
  homeNames: string[],
  otherNames?: string[] | null,
): { have: number; total: number } {
  const home = homeNames.map(foodWords).filter((words) => words.length > 0);
  const other = otherNames && otherNames.length === ingredientNames.length ? otherNames : null;
  const basic = (words: string[]) => ['water', 'salt'].includes(words.join(' '));
  let have = 0;
  let total = 0;
  ingredientNames.forEach((name, index) => {
    const words = foodWords(name);
    const alt = other?.[index] ? foodWords(other[index]) : [];
    if ((words.length === 0 && alt.length === 0) || basic(words) || basic(alt)) return;
    total += 1;
    if (home.some((h) => homeCovers(h, words) || homeCovers(h, alt))) have += 1;
  });
  return { have, total };
}

/** Whether an ingredient name is covered by what's at home. */
export function isAtHome(name: string, homeNames: string[]): boolean {
  const words = foodWords(name);
  return words.length > 0 && homeNames.some((home) => homeCovers(foodWords(home), words));
}

/** Can the Library carry these meals alone? (the 14-recipe rule, and the meals it is short on) */
export function libraryStatusFor(recipes: Recipe[], avoid: AvoidList, diets: string[], meals: PlanMeal[]): LibraryOnlyStatus {
  return libraryOnlyStatus(recipes.map((recipe) => candidateFromRecipe(recipe)), avoid, diets, [...new Set(meals.map(mealKindOf))] as MealKind[]);
}

export type FillRequest = {
  days: string[];
  meals: PlanMeal[];
  mode: 'fill' | 'reshuffle';
  useHub: boolean;
  leftovers: boolean;
  adjust: PlanAdjust;
};

export type FillContext = {
  userId: string;
  entries: MealPlanEntry[];
  recipes: Recipe[];
  avoid: AvoidList;
  diets: string[];
  homeNames: string[];
  weekend: number[];
  defaultServings: number;
  /** Hub cards to choose from, asked for only when the Hub is used. */
  hubCards: () => Promise<RecipeCard[]>;
  /** The app language: recipes' saved translations into it count when matching what is at home. */
  language?: string;
};

export type FillOutcome = {
  filled: number;
  empty: number;
  /** Why each meal was picked, by slotKey, for this visit (not saved). */
  reasons: Record<string, PlanReason>;
  /** Hub cards were saved to the Library: the apps reload their recipes. */
  savedHubRecipes: boolean;
};

/**
 * Fills (or reshuffles) the chosen days and meals and saves the result. `onlySlot` refills one meal; `exclude` keeps
 * recipes out (a shuffle never gives back the same one).
 */
export async function fillAndSavePlan(
  context: FillContext,
  request: FillRequest,
  onlySlot?: { date: string; meal: PlanMeal },
  exclude: string[] = [],
): Promise<FillOutcome> {
  const status = libraryStatusFor(context.recipes, context.avoid, context.diets, request.meals);
  const useHub = request.useHub || !status.allowed;
  const hubFor = status.thinMeals;
  const library: PlanCandidate[] = context.recipes.map((recipe) => candidateFromRecipe(recipe, context.language));
  const hub = useHub || hubFor.length > 0 ? hubCardsNotInLibrary(await context.hubCards(), context.recipes).map(candidateFromCard) : [];
  const candidates = [...library, ...hub].filter((candidate) => !exclude.includes(candidate.id));

  const { slots, replace } = onlySlot
    ? slotsToFill(context.entries, [onlySlot.date], [onlySlot.meal], 'reshuffle')
    : slotsToFill(context.entries, request.days, request.meals, request.mode);
  if (slots.length === 0) return { filled: 0, empty: 0, reasons: {}, savedHubRecipes: false };

  const result = fillWeek({
    slots,
    planned: plannedMeals(context.entries, replace),
    candidates,
    avoid: context.avoid,
    diets: context.diets,
    homeNames: context.homeNames,
    now: new Date(),
    weekend: context.weekend,
    useHub,
    hubFor,
    leftovers: request.leftovers,
    adjust: request.adjust,
    seed: `${Date.now()}`,
  });

  const recipeIds = new Set(context.recipes.map((recipe) => recipe.id));
  const cardIds = [...new Set(result.filled.map((meal) => meal.candidateId).filter((id) => !recipeIds.has(id)))];
  const claimed = new Map<string, string>();
  await Promise.all(
    cardIds.map(async (cardId) => {
      try {
        claimed.set(cardId, await claimHubCard(cardId));
      } catch {
        // A card that can't be saved leaves its meal empty.
      }
    }),
  );
  const recipeIdFor = (id: string) => (recipeIds.has(id) ? id : claimed.get(id) ?? null);

  // Save first, then take away what the new plan doesn't cover: a failed save leaves the old plan as it was. A saved
  // meal takes its slot's row (the same id), so only replaced rows that weren't written over go, among them leftovers
  // of a replaced meal that fell outside these days.
  const saved = await saveMealPlanMeals(context.userId, mealsToSave(result.filled, recipeIdFor, context.defaultServings));
  const savedIds = new Set(saved.map((entry) => entry.id));
  await deleteMealPlanEntries(replace.filter((entry) => !savedIds.has(entry.id)).map((entry) => entry.id));

  // Counted from what was saved: a Hub card that couldn't be saved leaves its meal (and its leftovers) empty.
  const savedSlots = new Set(saved.map((entry) => slotKey(entry.date, entry.meal)));
  const reasons: Record<string, PlanReason> = {};
  for (const meal of result.filled) {
    const key = slotKey(meal.date, meal.meal);
    if (savedSlots.has(key)) reasons[key] = meal.reason;
  }
  return {
    filled: savedSlots.size,
    empty: Math.max(0, slots.length - savedSlots.size),
    reasons,
    savedHubRecipes: claimed.size > 0,
  };
}

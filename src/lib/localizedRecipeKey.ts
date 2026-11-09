import type { Ingredient, Instruction } from '@/types/recipe';

type TextFields = {
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
};

/**
 * What a translation depends on: the recipe's words and amounts, not its grams/spoons. A
 * background recalculation (ADR 018) fills in metric/spoons after a hand edit; keying on them
 * would reset the translation and flash the source language while the new amounts land.
 */
export function recipeTextKey(recipe: TextFields): string {
  return JSON.stringify([
    recipe.title,
    recipe.servings,
    recipe.ingredients.map((item) => [item.name, item.quantity, item.unit]),
    recipe.instructions.map((step) => [step.step, step.text]),
  ]);
}

/** The grams/spoons part of the ingredients, to know when merged amounts must refresh. */
export function recipeAmountsKey(ingredients: Ingredient[] | undefined): string {
  return JSON.stringify((ingredients ?? []).map((item) => [item.metric ?? null, item.spoons ?? null]));
}

/**
 * Shows the live recipe's grams/spoons on the (possibly translated) ingredients, row by row.
 * Rows line up because the text key is unchanged. If the counts differ the display is kept as is.
 */
export function withLiveAmounts(display: Ingredient[], live: Ingredient[] | undefined): Ingredient[] {
  if (!live || live.length !== display.length) return display;
  return display.map((item, index) => {
    const { metric: _metric, spoons: _spoons, ...rest } = item;
    const source = live[index];
    return {
      ...rest,
      ...(source.metric ? { metric: source.metric } : {}),
      ...(source.spoons ? { spoons: source.spoons } : {}),
    };
  });
}

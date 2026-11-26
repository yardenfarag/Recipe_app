import { scaleIngredient } from "@shared/lib/ingredientAmounts";
import { keptOriginalLanguage, stampKeptOriginalLanguage } from "@shared/lib/keptOriginal";
import { resolveRecipeSourceLanguage } from "@shared/lib/recipeSourceLanguage";
import type { RecipeContentUpdate } from "@shared/lib/supabase/recipes";
import type { RepairedRecipePayload, RepairRecipeRequest } from "@shared/lib/supabase/repairRecipe";
import type { SubstitutionAlternative } from "@shared/lib/supabase/suggestSubstitution";
import type { TransformedRecipePayload } from "@shared/lib/supabase/transformRecipe";
import type { Instruction, Recipe } from "@shared/types/recipe";

import type { RecipeDisplay } from "@/components/recipe/types";

/** The recipe text before an adaptation, to go back to. The same shape as `recipes.kitchen_original`. */
export type OriginalContent = NonNullable<Recipe["kitchen_original"]>;

/**
 * A change to save to the recipe's own text. `sourceLanguage` is set when the change was made to a translation on
 * screen: that translation becomes the recipe's text, so its language becomes the recipe's (ADR 012 keeps the
 * stored text in `source_language`).
 */
export type ContentChange = { update: RecipeContentUpdate; sourceLanguage: string | null };

/**
 * The text an action works on: what the reader sees. When a translation is showing, Swap, Remix and "Make it
 * without these" change those words, as on mobile, and the result is saved as the recipe's text in that language.
 */
export function shownContent(display: RecipeDisplay): OriginalContent {
  return {
    title: display.title,
    servings: display.recipe.servings,
    ingredients: display.ingredients,
    instructions: display.instructions,
    calories: display.recipe.calories,
    nutrition: display.recipe.nutrition ?? null,
    appliances: display.recipe.appliances,
  };
}

/** The language a change made on screen is saved in: the translation's, or null when the recipe's own is showing. */
export function promotedLanguage(display: RecipeDisplay): string | null {
  return display.translated && display.contentLanguage ? display.contentLanguage : null;
}

/** What is on screen, kept to go back to, with the language it is in (PIN-188). */
export function shownOriginal(display: RecipeDisplay): OriginalContent {
  return { ...shownContent(display), language: promotedLanguage(display) ?? resolveRecipeSourceLanguage(display.recipe) };
}

/** The recipe's kept original with its language filled in; one kept before PIN-188 has none stored. */
export function keptOriginalOf(recipe: Recipe): OriginalContent | null {
  const kept = recipe.kitchen_original;
  return kept ? { ...kept, language: keptOriginalLanguage(kept, resolveRecipeSourceLanguage(recipe)) } : null;
}

const textOf = (content: OriginalContent) => ({
  title: content.title,
  servings: content.servings,
  ingredients: content.ingredients,
  instructions: content.instructions,
  calories: content.calories,
  // PIN-80: written with the calories, or the database clears it.
  nutrition: content.nutrition ?? null,
});

/**
 * Swap (ADR 005): the alternative replaces one ingredient and the steps follow. The alternative's amount is for the
 * servings on screen, so it is scaled back to the recipe's own count before it is stored, as on mobile.
 */
export function swapChange(
  display: RecipeDisplay,
  index: number,
  alternative: SubstitutionAlternative,
  servingsShown: number,
  instructions: Instruction[],
): ContentChange {
  const shown = shownContent(display);
  const factor = shown.servings / Math.max(1, servingsShown);
  const ingredients = shown.ingredients.map((ingredient, i) =>
    i === index
      ? scaleIngredient(
          {
            name: alternative.name,
            unit: alternative.unit,
            quantity: alternative.quantity,
            metric: alternative.metric,
            spoons: alternative.spoons,
          },
          factor,
        )
      : ingredient,
  );
  const language = promotedLanguage(display);
  // The recipe takes the translation's language now. A kept original stays in the old one: write that in first, or a
  // revert after a reload would save it under the new label (PIN-188).
  const kept = language
    ? stampKeptOriginalLanguage(display.recipe.kitchen_original, resolveRecipeSourceLanguage(display.recipe))
    : null;
  return {
    update: { ...textOf(shown), ingredients, instructions, ...(kept ? { kitchen_original: kept } : {}) },
    sourceLanguage: language,
  };
}

function adaptedText(display: RecipeDisplay, result: TransformedRecipePayload) {
  return {
    title: display.title,
    servings: result.servings,
    ingredients: result.ingredients,
    instructions: result.instructions,
    calories: result.calories,
    // A server from before PIN-80 sends none: no macros rather than the old recipe's.
    nutrition: result.nutrition ?? null,
    // The server only sends appliances when the adaptation changed the steps (ADR 017); absent keeps the stored ones.
    ...(result.appliances !== undefined ? { appliances: result.appliances } : {}),
  };
}

/** A remix replaces the text and, as on mobile, clears an earlier kitchen adaptation (ADR 018). */
export function remixChange(display: RecipeDisplay, result: TransformedRecipePayload): ContentChange {
  return {
    update: { ...adaptedText(display, result), kitchen_adapted_summary: null, kitchen_original: null },
    sourceLanguage: promotedLanguage(display),
  };
}

/**
 * "Make it without these" (the fix for allergies and dislikes). Saved the way "Always adapt new recipes" saves an
 * adaptation: with its summary and the text before it, so "Revert to original" works after a reload too, in both
 * apps. An earlier adaptation's original is kept, so reverting always lands on the recipe as it came.
 */
export function kitchenFixChange(
  display: RecipeDisplay,
  result: TransformedRecipePayload,
  /** The text before a remix made on this visit, which is the recipe as it came. */
  earlier?: OriginalContent | null,
): ContentChange {
  const language = promotedLanguage(display);
  const before = earlier ?? ((!language && keptOriginalOf(display.recipe)) || shownOriginal(display));
  return {
    update: { ...adaptedText(display, result), kitchen_adapted_summary: result.summary, kitchen_original: before },
    sourceLanguage: language,
  };
}

/**
 * Back to the text before a remix or kitchen adaptation, in the language that text is in (PIN-188): the recipe may
 * have taken a translation's since. `recipeLanguage` is only read for an original kept before PIN-188, which has none.
 */
export function revertChange(original: OriginalContent, recipeLanguage: string | null): ContentChange {
  return {
    update: {
      ...textOf(original),
      kitchen_adapted_summary: null,
      kitchen_original: null,
      ...(original.appliances !== undefined ? { appliances: original.appliances } : {}),
    },
    sourceLanguage: keptOriginalLanguage(original, recipeLanguage),
  };
}

/** What Repair sends: the recipe's own text and details, never a translation (as on mobile). */
export function repairRequest(recipe: Recipe): RepairRecipeRequest {
  return {
    title: recipe.title,
    servings: recipe.servings,
    ingredients: recipe.ingredients,
    instructions: recipe.instructions,
    calories: recipe.calories,
    estimated_time_minutes: recipe.estimated_time_minutes,
    cost_estimate: recipe.cost_estimate,
    effort_level: recipe.effort_level,
    tags: recipe.tags,
    source_language: recipe.source_language,
    original_url: recipe.original_url,
  };
}

/** The repaired recipe as it is saved, with its new extraction status (ADR 019), as mobile saves it. */
export function repairChange(repaired: RepairedRecipePayload): ContentChange {
  return {
    update: {
      title: repaired.title,
      servings: repaired.servings,
      ingredients: repaired.ingredients,
      instructions: repaired.instructions,
      calories: repaired.calories,
      nutrition: repaired.nutrition ?? null,
      extraction_status: repaired.extraction_status,
      missing_fields: repaired.missing_fields,
      estimated_time_minutes: repaired.estimated_time_minutes,
      cost_estimate: repaired.cost_estimate,
      effort_level: repaired.effort_level,
      tags: repaired.tags,
      appliances: repaired.appliances,
    },
    sourceLanguage: null,
  };
}

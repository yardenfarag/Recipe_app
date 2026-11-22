import { kitchenInstruction } from '../kitchenProfile';
import { recipeIsInvented } from '../recipeOrigin';
import type { ExtractedRecipe } from '../../types/recipe';
import { fetchCloudKitchenProfile } from './kitchen';
import { transformRecipe } from './transformRecipe';

/**
 * "Adapt new extracts automatically" (Settings → kitchen): after a Snap, rewrites the recipe for the person's
 * allergies, diets, swaps and dislikes, keeping the original so it can be reverted. Guessed recipes and recipes
 * without ingredients stay as they are. Does not use a remix.
 *
 * `failed` is true when the preference is on but the rewrite didn't work; the Snap is still ready, as it came.
 */
export async function applyKitchenOnExtract(
  userId: string,
  recipe: ExtractedRecipe,
): Promise<{ recipe: ExtractedRecipe; failed: boolean }> {
  if (recipe.ingredients.length === 0 || recipeIsInvented(recipe)) return { recipe, failed: false };
  try {
    const kitchen = await fetchCloudKitchenProfile(userId);
    const instruction = kitchen.autoApplyOnExtract ? kitchenInstruction(kitchen) : null;
    if (!instruction) return { recipe, failed: false };
    const adapted = await transformRecipe(
      kitchen.diets[0] ?? 'custom',
      {
        title: recipe.title,
        servings: recipe.servings,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        calories: recipe.calories,
        original_url: recipe.original_url,
      },
      instruction,
      { kitchenAutoApply: true },
    );
    if (adapted.status !== 'ok' || !adapted.recipe) return { recipe, failed: true };
    return {
      failed: false,
      recipe: {
        ...recipe,
        servings: adapted.recipe.servings,
        ingredients: adapted.recipe.ingredients,
        instructions: adapted.recipe.instructions,
        calories: adapted.recipe.calories,
        nutrition: adapted.recipe.nutrition ?? null,
        // ADR 017: present only when the adaptation changed the steps.
        ...(adapted.recipe.appliances !== undefined ? { appliances: adapted.recipe.appliances } : {}),
        kitchen_adapted_summary: adapted.recipe.summary,
        kitchen_original: {
          title: recipe.title,
          servings: recipe.servings,
          ingredients: recipe.ingredients,
          instructions: recipe.instructions,
          calories: recipe.calories,
          nutrition: recipe.nutrition ?? null,
          appliances: recipe.appliances,
        },
      },
    };
  } catch (error) {
    console.warn('[kitchen] auto-apply skipped', error);
    return { recipe, failed: true };
  }
}

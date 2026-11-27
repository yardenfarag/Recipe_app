import { withDailyAiUsage } from '../_shared/core/dailyAiUsage.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { labelSavedRecipe } from '../_shared/recipes/enrich/recipeDietsOnSave.ts';

/** Checks a day's worth of app-side changes; more than a cook makes, enough to stop a runaway client. */
const DAILY_LIMIT = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseRequest(raw: unknown): { recipeId: string } {
  const recipeId = (raw as { recipe_id?: unknown } | null)?.recipe_id;
  if (typeof recipeId !== 'string' || !UUID.test(recipeId)) throw new HttpError(400, 'invalid_request', 'recipe_id is required');
  return { recipeId };
}

/**
 * POST { recipe_id } -> { status: 'ok', labelled }
 *
 * PIN-77: checks which diets one of the cook's recipes fits, after a change the app saved itself (a remix, a swap, a
 * repair, a kitchen fix) cleared them. Does nothing when the recipe already has its diets, so calling it twice is
 * free. One small model call, capped per day (`recipe_diets`). The meal plan reads the answer from recipes.diets.
 */
handler(
  { name: 'label-recipe-diets', auth: 'user', maxBodyBytes: 1_000, input: parseRequest },
  async ({ input, user, admin }) => {
    const { data: recipe, error } = await admin
      .from('recipes')
      .select('id, title, ingredients, instructions, diets')
      .eq('id', input.recipeId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw new HttpError(500, 'server_error', "Couldn't read the recipe.");
    if (!recipe) throw new HttpError(404, 'not_found', 'Recipe not found');
    if (recipe.diets != null) return { status: 'ok', labelled: false };

    await withDailyAiUsage(admin, user.id, 'recipe_diets', DAILY_LIMIT, () =>
      labelSavedRecipe(admin, user.id, recipe.id, {
        title: recipe.title,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
      })
    );
    return { status: 'ok', labelled: true };
  },
);

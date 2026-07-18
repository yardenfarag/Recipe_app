import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { isRecipeVariantKey, transformRecipeWithGemini } from '../_shared/recipeVariant.ts';

interface RequestBody {
  variant?: string;
  recipe?: {
    title?: string;
    servings?: number;
    ingredients?: { name?: string; quantity?: number; unit?: string }[];
    instructions?: { step?: number; text?: string }[];
    calories?: number;
  };
}

/**
 * POST { variant, recipe } -> { status, recipe?, message? }
 *
 * Adapts a full recipe for a dietary/lifestyle goal (healthier, vegan, etc.).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const variant = body.variant?.trim();
  if (!variant || !isRecipeVariantKey(variant)) {
    return jsonResponse({ error: 'Missing or invalid "variant" in request body' }, 400);
  }

  const recipe = body.recipe;
  if (!recipe?.title?.trim()) {
    return jsonResponse({ error: 'Missing "recipe.title" in request body' }, 400);
  }

  const ingredients = (recipe.ingredients ?? [])
    .filter(
      (i): i is { name: string; quantity: number; unit: string } =>
        Boolean(i.name?.trim()) && i.quantity != null && Boolean(i.unit?.trim()),
    )
    .map((i) => ({ name: i.name.trim(), quantity: i.quantity, unit: i.unit.trim() }));

  const instructions = (recipe.instructions ?? [])
    .filter(
      (s): s is { step: number; text: string } =>
        s.step != null && typeof s.text === 'string' && s.text.trim().length > 0,
    )
    .map((s) => ({ step: s.step, text: s.text.trim() }));

  if (ingredients.length === 0) {
    return jsonResponse({ error: 'Recipe must include at least one ingredient' }, 400);
  }

  try {
    const transformed = await transformRecipeWithGemini({
      variant,
      title: recipe.title.trim(),
      servings: recipe.servings && recipe.servings > 0 ? recipe.servings : 1,
      ingredients,
      instructions,
      calories: recipe.calories,
    });

    if (transformed.ingredients.length === 0) {
      return jsonResponse({
        status: 'failed',
        message: "Couldn't adapt this recipe. Try a different option.",
      });
    }

    return jsonResponse({ status: 'ok', recipe: transformed, variant });
  } catch (err) {
    console.error('transform-recipe error:', err);
    return jsonResponse(
      {
        status: 'failed',
        message: 'Something went wrong adapting the recipe. Please try again.',
      },
      500,
    );
  }
});

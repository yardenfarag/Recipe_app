import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { suggestSubstitutionsWithGemini } from '../_shared/substitution.ts';

interface RequestBody {
  ingredient?: { name?: string; quantity?: number; unit?: string };
  recipe_title?: string;
  other_ingredients?: string[];
}

/**
 * POST { ingredient, recipe_title, other_ingredients } -> { status, alternatives? , message? }
 *
 * Asks Gemini for 2-3 substitutes for a single ingredient, using the
 * recipe title and remaining ingredients as context (ADR 005).
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

  const ingredient = body.ingredient;
  if (!ingredient?.name || ingredient.quantity == null || !ingredient.unit) {
    return jsonResponse({ error: 'Missing or invalid "ingredient" in request body' }, 400);
  }
  if (!body.recipe_title) {
    return jsonResponse({ error: 'Missing "recipe_title" in request body' }, 400);
  }

  try {
    const alternatives = await suggestSubstitutionsWithGemini({
      ingredient: {
        name: ingredient.name,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
      },
      recipeTitle: body.recipe_title,
      otherIngredients: body.other_ingredients ?? [],
    });

    if (alternatives.length === 0) {
      return jsonResponse({
        status: 'failed',
        message: "Couldn't find a good substitute for this ingredient. Try again.",
      });
    }

    return jsonResponse({ status: 'ok', alternatives });
  } catch (err) {
    console.error('suggest-substitution error:', err);
    return jsonResponse(
      {
        status: 'failed',
        message: 'Something went wrong finding a substitute. Please try again.',
      },
      500,
    );
  }
});

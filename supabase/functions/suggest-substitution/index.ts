import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  isSubstitutionLanguageCode,
  suggestSubstitutionsWithGemini,
} from '../_shared/substitution.ts';

const MAX_BODY_BYTES = 24_000;
const MAX_RECIPE_TITLE_CHARS = 200;
const MAX_INGREDIENT_NAME_CHARS = 160;
const MAX_UNIT_CHARS = 40;
const MAX_OTHER_INGREDIENTS = 60;
const MAX_OTHER_INGREDIENT_CHARS = 160;

interface RequestBody {
  ingredient?: { name?: string; quantity?: number; unit?: string };
  recipe_title?: string;
  other_ingredients?: string[];
  /** Active recipe language code (en/es/he/ru/ar/de/fr) when the user translated. */
  language?: string;
}

/**
 * POST { ingredient, recipe_title, other_ingredients, language? }
 *   -> { status, alternatives?, message? }
 *
 * Asks Gemini for 2-3 supermarket-realistic substitutes for a single
 * ingredient, biased to the cook's locale from `language` (ADR 005).
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }
  if (requestIsTooLarge(req, MAX_BODY_BYTES)) {
    return jsonResponse({ error: 'Request payload is too large' }, 400);
  }

  let body: RequestBody;
  try {
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'Request payload is too large' }, 400);
    }
    body = JSON.parse(rawBody) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const ingredient = body.ingredient;
  if (!ingredient?.name || ingredient.quantity == null) {
    return jsonResponse({ error: 'Missing or invalid "ingredient" in request body' }, 400);
  }
  const ingredientName = ingredient.name.trim();
  const ingredientUnit = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
  const quantity = Number(ingredient.quantity);
  if (
    !ingredientName ||
    ingredientName.length > MAX_INGREDIENT_NAME_CHARS ||
    ingredientUnit.length > MAX_UNIT_CHARS ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 1_000_000
  ) {
    return jsonResponse({ error: 'Invalid "ingredient" in request body' }, 400);
  }

  const recipeTitle = body.recipe_title?.trim();
  if (!recipeTitle) {
    return jsonResponse({ error: 'Missing "recipe_title" in request body' }, 400);
  }
  if (recipeTitle.length > MAX_RECIPE_TITLE_CHARS) {
    return jsonResponse(
      { error: `Recipe title must be ${MAX_RECIPE_TITLE_CHARS} characters or fewer` },
      400,
    );
  }
  if (
    body.other_ingredients != null &&
    (!Array.isArray(body.other_ingredients) ||
      body.other_ingredients.length > MAX_OTHER_INGREDIENTS ||
      body.other_ingredients.some(
        (item) =>
          typeof item !== 'string' ||
          !item.trim() ||
          item.trim().length > MAX_OTHER_INGREDIENT_CHARS,
      ))
  ) {
    return jsonResponse(
      { error: `Other ingredients must contain at most ${MAX_OTHER_INGREDIENTS} short names` },
      400,
    );
  }

  const languageRaw = body.language?.trim().toLowerCase();
  const language =
    languageRaw && isSubstitutionLanguageCode(languageRaw) ? languageRaw : null;

  try {
    const alternatives = await suggestSubstitutionsWithGemini({
      ingredient: {
        name: ingredientName,
        quantity,
        unit: ingredientUnit,
      },
      recipeTitle,
      otherIngredients: (body.other_ingredients ?? []).map((item) => item.trim()),
      language,
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

function requestIsTooLarge(req: Request, maxBytes: number): boolean {
  const contentLength = Number(req.headers.get('content-length'));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import {
  isTranslateLanguageCode,
  translateRecipeWithGemini,
} from '../_shared/translateRecipe.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';

const MAX_BODY_BYTES = 64_000;
const MAX_TITLE_CHARS = 200;
const MAX_INGREDIENTS = 60;
const MAX_INSTRUCTIONS = 50;
const MAX_INGREDIENT_NAME_CHARS = 160;
const MAX_UNIT_CHARS = 40;
const MAX_INSTRUCTION_CHARS = 1_000;

interface RequestBody {
  target_language?: string;
  recipe?: {
    title?: string;
    ingredients?: { name?: string; quantity?: number; unit?: string }[];
    instructions?: { step?: number; text?: string }[];
  };
}

/**
 * POST { target_language, recipe } -> { status, recipe?, message? }
 *
 * Translates recipe title, ingredients, and instructions. Free for now
 * (logged for cost tracking); no product-token charge.
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

  const started = Date.now();
  const authHeader = req.headers.get('Authorization');
  let userId: string | null = null;
  if (authHeader) {
    const authed = createAuthedSupabase(authHeader);
    if (authed) {
      const {
        data: { user },
      } = await authed.auth.getUser();
      userId = user?.id ?? null;
    }
  }

  const admin = createServiceSupabase();

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

  const targetLanguage = body.target_language?.trim().toLowerCase();
  if (!targetLanguage || !isTranslateLanguageCode(targetLanguage)) {
    return jsonResponse(
      {
        error:
          'Missing or invalid "target_language". Use: en, es, he, ru, ar, de, fr.',
      },
      400,
    );
  }

  const recipe = body.recipe;
  if (!recipe?.title?.trim()) {
    return jsonResponse({ error: 'Missing "recipe.title" in request body' }, 400);
  }
  if (recipe.title.trim().length > MAX_TITLE_CHARS) {
    return jsonResponse({ error: `Recipe title must be ${MAX_TITLE_CHARS} characters or fewer` }, 400);
  }
  if (!Array.isArray(recipe.ingredients) || recipe.ingredients.length > MAX_INGREDIENTS) {
    return jsonResponse({ error: `Recipe may include at most ${MAX_INGREDIENTS} ingredients` }, 400);
  }
  if (!Array.isArray(recipe.instructions) || recipe.instructions.length > MAX_INSTRUCTIONS) {
    return jsonResponse({ error: `Recipe may include at most ${MAX_INSTRUCTIONS} instructions` }, 400);
  }
  if (
    recipe.ingredients.some((ingredient) => {
      const quantity = Number(ingredient?.quantity);
      return (
        typeof ingredient?.name !== 'string' ||
        !ingredient.name.trim() ||
        ingredient.name.trim().length > MAX_INGREDIENT_NAME_CHARS ||
        (ingredient.unit != null && typeof ingredient.unit !== 'string') ||
        (typeof ingredient.unit === 'string' && ingredient.unit.trim().length > MAX_UNIT_CHARS) ||
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        quantity > 1_000_000
      );
    })
  ) {
    return jsonResponse({ error: 'Recipe contains an invalid ingredient' }, 400);
  }
  if (
    recipe.instructions.some(
      (instruction) =>
        typeof instruction?.step !== 'number' ||
        !Number.isInteger(instruction.step) ||
        instruction.step < 1 ||
        typeof instruction?.text !== 'string' ||
        !instruction.text.trim() ||
        instruction.text.trim().length > MAX_INSTRUCTION_CHARS,
    )
  ) {
    return jsonResponse({ error: 'Recipe contains an invalid instruction' }, 400);
  }

  const ingredients = (recipe.ingredients ?? [])
    .filter((i) => Boolean(i.name?.trim()) && Number.isFinite(Number(i.quantity)))
    .map((i) => ({
      name: i.name!.trim(),
      quantity: Number(i.quantity),
      unit: typeof i.unit === 'string' ? i.unit.trim() : '',
    }));

  const instructions = (recipe.instructions ?? [])
    .filter(
      (s): s is { step: number; text: string } =>
        s.step != null && typeof s.text === 'string' && s.text.trim().length > 0,
    )
    .map((s) => ({ step: s.step, text: s.text.trim() }));

  if (ingredients.length === 0 && instructions.length === 0) {
    return jsonResponse({ error: 'Recipe must include ingredients or instructions to translate' }, 400);
  }

  try {
    const translated = await translateRecipeWithGemini({
      targetLanguage,
      title: recipe.title.trim(),
      ingredients,
      instructions,
    });

    if (!translated.title.trim()) {
      await logUsageEvent(admin, {
        userId,
        action: 'translate',
        status: 'failed',
        usages: translated.usage ? [translated.usage] : [],
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: { targetLanguage },
        errorMessage: 'Empty translated title',
      });
      return jsonResponse({
        status: 'failed',
        message: "Couldn't translate this recipe. Try again.",
      });
    }

    const { usage: _usage, ...recipePayload } = translated;
    await logUsageEvent(admin, {
      userId,
      action: 'translate',
      status: 'ok',
      usages: translated.usage ? [translated.usage] : [],
      tokensCharged: 0,
      durationMs: Date.now() - started,
      metadata: { targetLanguage },
    });

    return jsonResponse({
      status: 'ok',
      target_language: targetLanguage,
      recipe: recipePayload,
    });
  } catch (err) {
    console.error('translate-recipe error:', err);
    const errMessage = err instanceof Error ? err.message : String(err);
    const timedOut = /timedOut=true/i.test(errMessage);
    await logUsageEvent(admin, {
      userId,
      action: 'translate',
      status: 'error',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      errorMessage: errMessage.slice(0, 500),
      metadata: { targetLanguage, timedOut },
    });
    return jsonResponse(
      {
        status: 'failed',
        message: timedOut
          ? 'Translation timed out. Please try again in a moment.'
          : 'Something went wrong translating the recipe. Please try again.',
      },
      500,
    );
  }
});

function requestIsTooLarge(req: Request, maxBytes: number): boolean {
  const contentLength = Number(req.headers.get('content-length'));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

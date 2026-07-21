import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { TOKEN_COST_REMIX } from '../_shared/pricing.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { isRecipeVariantKey, transformRecipeWithGemini } from '../_shared/recipeVariant.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import { getTokenBalance, spendTokens } from '../_shared/tokens.ts';
import { logUsageEvent } from '../_shared/usageLog.ts';

const MAX_BODY_BYTES = 64_000;
const MAX_TITLE_CHARS = 200;
const MAX_INGREDIENTS = 60;
const MAX_INSTRUCTIONS = 50;
const MAX_INGREDIENT_NAME_CHARS = 160;
const MAX_UNIT_CHARS = 40;
const MAX_INSTRUCTION_CHARS = 1_000;

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
 * POST { variant, recipe } -> { status, recipe?, message?, tokens_charged?, token_balance? }
 *
 * Adapts a full recipe for a dietary/lifestyle goal (healthier, vegan, etc.).
 * Requires a signed-in user and spends 5 tokens on success.
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
  if (!authHeader) {
    return jsonResponse(
      {
        status: 'failed',
        code: 'auth_required',
        message: 'Sign in to remix recipes.',
      },
      401,
    );
  }

  const authed = createAuthedSupabase(authHeader);
  if (!authed) {
    return jsonResponse({ status: 'failed', message: 'Auth is not configured.' }, 500);
  }

  const {
    data: { user },
  } = await authed.auth.getUser();
  if (!user) {
    return jsonResponse(
      {
        status: 'failed',
        code: 'auth_required',
        message: 'Sign in to remix recipes.',
      },
      401,
    );
  }

  const admin = createServiceSupabase();
  const balance = admin ? await getTokenBalance(admin, user.id) : null;
  if (balance != null && balance < TOKEN_COST_REMIX) {
    await logUsageEvent(admin, {
      userId: user.id,
      action: 'remix',
      status: 'insufficient_tokens',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      metadata: { balance, required: TOKEN_COST_REMIX },
    });
    return jsonResponse(
      {
        status: 'failed',
        code: 'insufficient_tokens',
        message: `You need ${TOKEN_COST_REMIX} tokens to remix a recipe. You have ${balance}.`,
        token_balance: balance,
        tokens_required: TOKEN_COST_REMIX,
      },
      402,
    );
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

  const variant = body.variant?.trim();
  if (!variant || !isRecipeVariantKey(variant)) {
    return jsonResponse({ error: 'Missing or invalid "variant" in request body' }, 400);
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
    recipe.ingredients.some(
      (ingredient) =>
        typeof ingredient?.name !== 'string' ||
        !ingredient.name.trim() ||
        ingredient.name.trim().length > MAX_INGREDIENT_NAME_CHARS ||
        typeof ingredient?.unit !== 'string' ||
        !ingredient.unit.trim() ||
        ingredient.unit.trim().length > MAX_UNIT_CHARS ||
        typeof ingredient?.quantity !== 'number' ||
        !Number.isFinite(ingredient.quantity) ||
        ingredient.quantity < 0 ||
        ingredient.quantity > 1_000_000,
    )
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
  if (
    recipe.servings != null &&
    (!Number.isInteger(recipe.servings) || recipe.servings < 1 || recipe.servings > 1_000)
  ) {
    return jsonResponse({ error: 'Recipe servings must be between 1 and 1000' }, 400);
  }
  if (
    recipe.calories != null &&
    (!Number.isFinite(recipe.calories) || recipe.calories < 0 || recipe.calories > 10_000_000)
  ) {
    return jsonResponse({ error: 'Recipe calories are invalid' }, 400);
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
      await logUsageEvent(admin, {
        userId: user.id,
        action: 'remix',
        status: 'failed',
        usages: transformed.usage ? [transformed.usage] : [],
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: { variant },
        errorMessage: 'Empty adapted ingredients',
      });
      return jsonResponse({
        status: 'failed',
        message: "Couldn't adapt this recipe. Try a different option.",
      });
    }

    let tokenBalance = balance;
    let tokensCharged = 0;
    if (admin) {
      const spent = await spendTokens(admin, user.id, TOKEN_COST_REMIX, 'remix', variant, {
        variant,
        title: recipe.title.trim().slice(0, 80),
      });
      if (!spent.ok) {
        await logUsageEvent(admin, {
          userId: user.id,
          action: 'remix',
          status: spent.code === 'insufficient_tokens' ? 'insufficient_tokens' : 'metering_error',
          usages: transformed.usage ? [transformed.usage] : [],
          tokensCharged: 0,
          durationMs: Date.now() - started,
          metadata: { variant },
          errorMessage: spent.code,
        });
        return jsonResponse(
          {
            status: 'failed',
            code: spent.code === 'insufficient_tokens' ? 'insufficient_tokens' : 'metering_error',
            message:
              spent.code === 'insufficient_tokens'
                ? `You need ${TOKEN_COST_REMIX} tokens to remix a recipe.`
                : 'Could not update your token balance. Please try again.',
            token_balance: await getTokenBalance(admin, user.id),
            tokens_required: TOKEN_COST_REMIX,
          },
          spent.code === 'insufficient_tokens' ? 402 : 500,
        );
      }
      tokensCharged = TOKEN_COST_REMIX;
      tokenBalance = spent.balance;
    }

    const { usage: _usage, ...recipePayload } = transformed;
    await logUsageEvent(admin, {
      userId: user.id,
      action: 'remix',
      status: 'ok',
      usages: transformed.usage ? [transformed.usage] : [],
      tokensCharged,
      durationMs: Date.now() - started,
      metadata: { variant },
    });

    return jsonResponse({
      status: 'ok',
      recipe: recipePayload,
      variant,
      tokens_charged: tokensCharged,
      token_balance: tokenBalance,
    });
  } catch (err) {
    console.error('transform-recipe error:', err);
    await logUsageEvent(admin, {
      userId: user.id,
      action: 'remix',
      status: 'error',
      tokensCharged: 0,
      durationMs: Date.now() - started,
      errorMessage: err instanceof Error ? err.message.slice(0, 500) : String(err),
      metadata: { variant },
    });
    return jsonResponse(
      {
        status: 'failed',
        message: 'Something went wrong adapting the recipe. Please try again.',
      },
      500,
    );
  }
});

function requestIsTooLarge(req: Request, maxBytes: number): boolean {
  const contentLength = Number(req.headers.get('content-length'));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import {
  currentUtcDate,
  refundDailyAiUsage,
  reserveDailyAiUsage,
} from '../_shared/dailyAiUsage.ts';
import { createAuthedSupabase } from '../_shared/recipeLookup.ts';
import { createServiceSupabase } from '../_shared/supabaseAdmin.ts';
import {
  isSubstitutionLanguageCode,
  rewriteInstructionsForSubstitutionWithGemini,
  suggestSubstitutionsWithGemini,
} from '../_shared/substitution.ts';

const MAX_BODY_BYTES = 24_000;
const MAX_RECIPE_TITLE_CHARS = 200;
const MAX_INGREDIENT_NAME_CHARS = 160;
const MAX_UNIT_CHARS = 40;
const MAX_OTHER_INGREDIENTS = 60;
const MAX_OTHER_INGREDIENT_CHARS = 160;
const MAX_INSTRUCTIONS = 80;
const MAX_INSTRUCTION_CHARS = 2_000;
const DAILY_SUBSTITUTION_LIMIT = 20;

interface BillingContext {
  admin: NonNullable<ReturnType<typeof createServiceSupabase>>;
  userId: string;
  usageDate: string;
}

interface RequestBody {
  /** Default: suggest alternatives. `rewrite_instructions` patches steps after apply. */
  mode?: string;
  ingredient?: { name?: string; quantity?: number; unit?: string };
  alternative?: { name?: string; quantity?: number; unit?: string; reason?: string };
  recipe_title?: string;
  other_ingredients?: string[];
  instructions?: { step?: number; text?: string }[];
  /** Active recipe language code (en/es/he/ru/ar/de/fr) when the user translated. */
  language?: string;
}

/**
 * POST suggest: { ingredient, recipe_title, other_ingredients, language? }
 *   -> { status, alternatives?, message? }
 *
 * POST rewrite: { mode: 'rewrite_instructions', ingredient, alternative, instructions, ... }
 *   -> { status, instructions?, message? }
 *
 * Asks Gemini for supermarket-realistic substitutes, or patches steps after a swap (ADR 005).
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

  const authHeader = req.headers.get('Authorization');
  const authed = authHeader ? createAuthedSupabase(authHeader) : null;
  const {
    data: { user },
  } = authed ? await authed.auth.getUser() : { data: { user: null } };
  if (!user) {
    return jsonResponse(
      { status: 'failed', code: 'auth_required', message: 'Sign in to use substitutions.' },
      401,
    );
  }
  const admin = createServiceSupabase();
  if (!admin) {
    return jsonResponse({ status: 'failed', code: 'metering_error', message: 'metering_error' }, 500);
  }
  const billing: BillingContext = {
    admin,
    userId: user.id,
    usageDate: currentUtcDate(),
  };

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

  const mode = body.mode?.trim() || 'suggest';
  if (mode === 'rewrite_instructions') {
    return handleRewrite(body, billing);
  }
  if (mode !== 'suggest') {
    return jsonResponse({ error: 'Unsupported mode' }, 400);
  }
  return handleSuggest(body, billing);
});

async function handleSuggest(body: RequestBody, billing: BillingContext): Promise<Response> {
  const parsedIngredient = parseIngredient(body.ingredient);
  if (!parsedIngredient.ok) {
    return jsonResponse({ error: parsedIngredient.error }, 400);
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

  const language = parseLanguage(body.language);
  const gate = await reserveSubstitutionUsage(billing);
  if (gate) return gate;

  try {
    const alternatives = await suggestSubstitutionsWithGemini({
      ingredient: parsedIngredient.value,
      recipeTitle,
      otherIngredients: (body.other_ingredients ?? []).map((item) => item.trim()),
      language,
    });

    if (alternatives.length === 0) {
      await refundDailyAiUsage(
        billing.admin,
        billing.userId,
        'substitution',
        billing.usageDate,
      );
      return jsonResponse({
        status: 'failed',
        message: "Couldn't find a good substitute for this ingredient. Try again.",
      });
    }

    return jsonResponse({ status: 'ok', alternatives });
  } catch (err) {
    console.error('suggest-substitution error:', err);
    await refundDailyAiUsage(
      billing.admin,
      billing.userId,
      'substitution',
      billing.usageDate,
    );
    return jsonResponse(
      {
        status: 'failed',
        message: 'Something went wrong finding a substitute. Please try again.',
      },
      500,
    );
  }
}

async function handleRewrite(body: RequestBody, billing: BillingContext): Promise<Response> {
  const parsedIngredient = parseIngredient(body.ingredient);
  if (!parsedIngredient.ok) {
    return jsonResponse({ error: parsedIngredient.error }, 400);
  }
  const parsedAlternative = parseIngredient(body.alternative, 'alternative');
  if (!parsedAlternative.ok) {
    return jsonResponse({ error: parsedAlternative.error }, 400);
  }

  const instructions = parseInstructions(body.instructions);
  if (!instructions.ok) {
    return jsonResponse({ error: instructions.error }, 400);
  }

  const recipeTitle = body.recipe_title?.trim();
  if (recipeTitle != null && recipeTitle.length > MAX_RECIPE_TITLE_CHARS) {
    return jsonResponse(
      { error: `Recipe title must be ${MAX_RECIPE_TITLE_CHARS} characters or fewer` },
      400,
    );
  }

  if (instructions.value.length === 0) {
    return jsonResponse({ status: 'ok', instructions: [] });
  }

  const language = parseLanguage(body.language);
  const gate = await reserveSubstitutionUsage(billing);
  if (gate) return gate;

  try {
    const rewritten = await rewriteInstructionsForSubstitutionWithGemini({
      ingredient: parsedIngredient.value,
      alternative: parsedAlternative.value,
      instructions: instructions.value,
      recipeTitle: recipeTitle || undefined,
      language,
    });

    if (rewritten.length === 0) {
      await refundDailyAiUsage(
        billing.admin,
        billing.userId,
        'substitution',
        billing.usageDate,
      );
      return jsonResponse({
        status: 'failed',
        message: "Couldn't update the recipe steps for this swap. Try again.",
      });
    }

    return jsonResponse({ status: 'ok', instructions: rewritten });
  } catch (err) {
    console.error('suggest-substitution rewrite error:', err);
    await refundDailyAiUsage(
      billing.admin,
      billing.userId,
      'substitution',
      billing.usageDate,
    );
    return jsonResponse(
      {
        status: 'failed',
        message: 'Something went wrong updating the recipe steps. Please try again.',
      },
      500,
    );
  }
}

async function reserveSubstitutionUsage(billing: BillingContext): Promise<Response | null> {
  const result = await reserveDailyAiUsage(
    billing.admin,
    billing.userId,
    'substitution',
    DAILY_SUBSTITUTION_LIMIT,
    billing.usageDate,
  );
  if (result === 'ok') return null;
  if (result === 'limited') {
    return jsonResponse(
      { status: 'failed', code: 'daily_limit', message: 'daily_limit' },
      429,
    );
  }
  return jsonResponse(
    { status: 'failed', code: 'metering_error', message: 'metering_error' },
    500,
  );
}

function parseLanguage(value: string | undefined) {
  const languageRaw = value?.trim().toLowerCase();
  return languageRaw && isSubstitutionLanguageCode(languageRaw) ? languageRaw : null;
}

function parseIngredient(
  ingredient: RequestBody['ingredient'] | RequestBody['alternative'],
  label = 'ingredient',
):
  | { ok: true; value: { name: string; quantity: number; unit: string } }
  | { ok: false; error: string } {
  if (!ingredient?.name || ingredient.quantity == null) {
    return { ok: false, error: `Missing or invalid "${label}" in request body` };
  }
  const name = ingredient.name.trim();
  const unit = typeof ingredient.unit === 'string' ? ingredient.unit.trim() : '';
  const quantity = Number(ingredient.quantity);
  if (
    !name ||
    name.length > MAX_INGREDIENT_NAME_CHARS ||
    unit.length > MAX_UNIT_CHARS ||
    !Number.isFinite(quantity) ||
    quantity < 0 ||
    quantity > 1_000_000
  ) {
    return { ok: false, error: `Invalid "${label}" in request body` };
  }
  return { ok: true, value: { name, quantity, unit } };
}

function parseInstructions(
  instructions: RequestBody['instructions'],
):
  | { ok: true; value: { step: number; text: string }[] }
  | { ok: false; error: string } {
  if (instructions == null) {
    return { ok: false, error: 'Missing "instructions" in request body' };
  }
  if (!Array.isArray(instructions) || instructions.length > MAX_INSTRUCTIONS) {
    return {
      ok: false,
      error: `Instructions must be an array of at most ${MAX_INSTRUCTIONS} steps`,
    };
  }

  const value: { step: number; text: string }[] = [];
  for (let i = 0; i < instructions.length; i++) {
    const row = instructions[i];
    const text = typeof row?.text === 'string' ? row.text.trim() : '';
    const step = Number(row?.step);
    if (
      !text ||
      text.length > MAX_INSTRUCTION_CHARS ||
      !Number.isFinite(step) ||
      step < 1
    ) {
      return { ok: false, error: 'Invalid "instructions" in request body' };
    }
    value.push({ step: Math.round(step), text });
  }
  return { ok: true, value };
}

function requestIsTooLarge(req: Request, maxBytes: number): boolean {
  const contentLength = Number(req.headers.get('content-length'));
  return Number.isFinite(contentLength) && contentLength > maxBytes;
}

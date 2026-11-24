import { HttpError } from '../core/httpError.ts';
import {
  isSubstitutionLanguageCode,
  type RewriteInstructionsForSubstitutionInput,
  type SuggestSubstitutionInput,
} from './substitution.ts';

export const MAX_SUBSTITUTION_BODY_BYTES = 24_000;
const MAX_RECIPE_TITLE_CHARS = 200;
const MAX_INGREDIENT_NAME_CHARS = 160;
const MAX_UNIT_CHARS = 40;
const MAX_OTHER_INGREDIENTS = 60;
const MAX_OTHER_INGREDIENT_CHARS = 160;
const MAX_INSTRUCTIONS = 80;
const MAX_INSTRUCTION_CHARS = 2_000;

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

export type SubstitutionRequest =
  | ({ mode: 'suggest' } & SuggestSubstitutionInput)
  | ({ mode: 'rewrite_instructions' } & RewriteInstructionsForSubstitutionInput);

const bad = (message: string) => HttpError.legacy(400, message);

/**
 * suggest-substitution's request, checked and trimmed: `{ ingredient, recipe_title, other_ingredients, language? }`,
 * or `{ mode: 'rewrite_instructions', ingredient, alternative, instructions, ... }`. Bad requests get the old
 * `{ error }` 400 bodies. Like the code it came from, a body that isn't an object (`null`, say) or a field of the
 * wrong type (a number for `mode`, say) throws a TypeError, which is a 500.
 */
export function parseSubstitutionRequest(raw: unknown): SubstitutionRequest {
  const body = raw as RequestBody;
  const mode = body.mode?.trim() || 'suggest';
  if (mode === 'rewrite_instructions') return parseRewrite(body);
  if (mode !== 'suggest') throw bad('Unsupported mode');
  return parseSuggest(body);
}

function parseSuggest(body: RequestBody): SubstitutionRequest {
  const ingredient = parseIngredient(body.ingredient);

  const recipeTitle = body.recipe_title?.trim();
  if (!recipeTitle) throw bad('Missing "recipe_title" in request body');
  if (recipeTitle.length > MAX_RECIPE_TITLE_CHARS) {
    throw bad(`Recipe title must be ${MAX_RECIPE_TITLE_CHARS} characters or fewer`);
  }
  if (
    body.other_ingredients != null &&
    (!Array.isArray(body.other_ingredients) ||
      body.other_ingredients.length > MAX_OTHER_INGREDIENTS ||
      body.other_ingredients.some(
        (item) => typeof item !== 'string' || !item.trim() || item.trim().length > MAX_OTHER_INGREDIENT_CHARS,
      ))
  ) {
    throw bad(`Other ingredients must contain at most ${MAX_OTHER_INGREDIENTS} short names`);
  }

  const language = parseLanguage(body.language);
  return {
    mode: 'suggest',
    ingredient,
    recipeTitle,
    otherIngredients: (body.other_ingredients ?? []).map((item) => item.trim()),
    language,
  };
}

function parseRewrite(body: RequestBody): SubstitutionRequest {
  const ingredient = parseIngredient(body.ingredient);
  const alternative = parseIngredient(body.alternative, 'alternative');
  const instructions = parseInstructions(body.instructions);

  const recipeTitle = body.recipe_title?.trim();
  if (recipeTitle != null && recipeTitle.length > MAX_RECIPE_TITLE_CHARS) {
    throw bad(`Recipe title must be ${MAX_RECIPE_TITLE_CHARS} characters or fewer`);
  }

  return {
    mode: 'rewrite_instructions',
    ingredient,
    alternative,
    instructions,
    recipeTitle: recipeTitle || undefined,
    // With no steps the function answers before the language was ever read, so a bad one can't fail the request.
    language: instructions.length === 0 ? null : parseLanguage(body.language),
  };
}

function parseLanguage(value: string | undefined) {
  const languageRaw = value?.trim().toLowerCase();
  return languageRaw && isSubstitutionLanguageCode(languageRaw) ? languageRaw : null;
}

function parseIngredient(
  ingredient: RequestBody['ingredient'] | RequestBody['alternative'],
  label = 'ingredient',
): { name: string; quantity: number; unit: string } {
  if (!ingredient?.name || ingredient.quantity == null) {
    throw bad(`Missing or invalid "${label}" in request body`);
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
    throw bad(`Invalid "${label}" in request body`);
  }
  return { name, quantity, unit };
}

function parseInstructions(instructions: RequestBody['instructions']): { step: number; text: string }[] {
  if (instructions == null) throw bad('Missing "instructions" in request body');
  if (!Array.isArray(instructions) || instructions.length > MAX_INSTRUCTIONS) {
    throw bad(`Instructions must be an array of at most ${MAX_INSTRUCTIONS} steps`);
  }

  const value: { step: number; text: string }[] = [];
  for (let i = 0; i < instructions.length; i++) {
    const row = instructions[i];
    const text = typeof row?.text === 'string' ? row.text.trim() : '';
    const step = Number(row?.step);
    if (!text || text.length > MAX_INSTRUCTION_CHARS || !Number.isFinite(step) || step < 1) {
      throw bad('Invalid "instructions" in request body');
    }
    value.push({ step: Math.round(step), text });
  }
  return value;
}

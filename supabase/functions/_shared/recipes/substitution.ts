// Ingredient substitution through the LLM client (OpenRouter).

import { generateLlmJson } from '../llm/llmClient.ts';
import { sanitizeLlmText } from '../llm/llmClient.ts';
import {
  DUAL_INGREDIENT_SCHEMA,
  MEASUREMENT_RULES,
  normalizeDualIngredient,
  type DualIngredient,
} from './ingredientAmounts.ts';
import type { LlmUsageSnapshot } from '../llm/pricing.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const REWRITE_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 1_536;
const REWRITE_MAX_OUTPUT_TOKENS = 4_096;

export const SUBSTITUTION_LANGUAGE_CODES = ['en', 'es', 'he', 'ru', 'ar', 'de', 'fr'] as const;
export type SubstitutionLanguageCode = (typeof SUBSTITUTION_LANGUAGE_CODES)[number];

/** Grocery-market hints keyed by recipe language. */
const MARKET_CONTEXT: Record<
  SubstitutionLanguageCode,
  { languageName: string; market: string; examples: string }
> = {
  en: {
    languageName: 'English',
    market: 'typical US / UK / English-speaking supermarket (Walmart, Kroger, Tesco, etc.)',
    examples: 'all-purpose flour, Greek yogurt, canola oil, chicken stock, brown sugar',
  },
  es: {
    languageName: 'Spanish',
    market: 'typical supermarket in Spain or Latin America (Mercadona, Carrefour, Walmart México, etc.)',
    examples: 'harina de trigo, yogur natural, aceite de oliva, caldo de pollo, azúcar moreno',
  },
  he: {
    languageName: 'Hebrew',
    market:
      'typical Israeli supermarket / grocery (שופרסל, רמי לוי, ויקטורי, Tiv Taam, neighborhood greengrocer)',
    examples:
      'קמח לבן, שמנת לבישול 15%, שמן קנולה, גבינת קוטג׳, טחינה גולמית, פתיתים, אבקת אפייה, מרק עוף אמיתי/אבקה',
  },
  ru: {
    languageName: 'Russian',
    market: 'typical supermarket in Russia / Russian-speaking regions (Перекрёсток, Пятёрочка, etc.)',
    examples: 'пшеничная мука, сметана, подсолнечное масло, куриный бульон, сахар',
  },
  ar: {
    languageName: 'Arabic',
    market: 'typical supermarket / grocer in the Levant or broader MENA region',
    examples: 'طحين أبيض، لبن، زيت نباتي، طحينة، لبنة، مرق دجاج',
  },
  de: {
    languageName: 'German',
    market: 'typical German supermarket (Rewe, Edeka, Aldi, Lidl)',
    examples: 'Weizenmehl, Sahne, Rapsöl, Gemüsebrühe, Quark',
  },
  fr: {
    languageName: 'French',
    market: 'typical French supermarket (Carrefour, Auchan, Monoprix, Leclerc)',
    examples: 'farine de blé, crème fraîche, huile de tournesol, bouillon de volaille, fromage blanc',
  },
};

const SYSTEM_PROMPT = `You are a practical home-cooking expert helping someone who is missing one ingredient.

Rules:
- Suggest exactly 2–3 substitutes that a normal person can buy today at a regular grocery store or supermarket for the cook's locale — NOT specialty shops, gourmet imports, or hard-to-find items.
- Prefer everyday brands/staples: dairy aisle, baking aisle, oils, eggs, common produce, common pantry dry goods.
- Avoid obscure specialty products, restaurant-only items, or ingredients that usually need ordering online.
- Adjust quantity/unit so the substitute works in this recipe (not always 1:1).
${MEASUREMENT_RULES}
- Fit the dish: use the recipe title and other ingredients so swaps make culinary sense.
- Write each substitute name and reason in the target language.
- Keep each reason to one short sentence in plain language.
- Return ONLY data matching the schema.`;

const SUBSTITUTION_SCHEMA = {
  type: 'object',
  properties: {
    alternatives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
          metric: DUAL_INGREDIENT_SCHEMA.properties.metric,
          spoons: DUAL_INGREDIENT_SCHEMA.properties.spoons,
          reason: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit', 'metric', 'spoons', 'reason'],
      },
    },
  },
  required: ['alternatives'],
};

export interface SubstitutionAlternative {
  name: string;
  quantity: number;
  unit: string;
  metric?: DualIngredient['metric'];
  spoons?: DualIngredient['spoons'];
  reason: string;
}

export interface SuggestSubstitutionInput {
  ingredient: { name: string; quantity: number; unit: string };
  recipeTitle: string;
  otherIngredients: string[];
  /** Active recipe language when known; otherwise the model infers it from the ingredient text. */
  language?: SubstitutionLanguageCode | null;
}

export interface RewriteInstructionsForSubstitutionInput {
  ingredient: { name: string; quantity: number; unit: string };
  alternative: { name: string; quantity: number; unit: string };
  instructions: { step: number; text: string }[];
  recipeTitle?: string;
  language?: SubstitutionLanguageCode | null;
}

const REWRITE_SYSTEM_PROMPT = `You are a practical home-cooking expert updating recipe steps after one ingredient was swapped.

Rules:
- Rewrite instructions so they match the substitute (name, quantity/unit, and technique only when needed).
- Return every input step, in the same order, with the same step numbers. Never drop, merge, split or add a step.
- Change only steps that mention the old ingredient or need a technique tweak for the substitute. Copy every other step word for word.
- A step's text is only what the cook does. Never write notes, explanations or comments about the swap, the recipe or these rules. When nothing needs to change, return the steps unchanged.
- Write each step in the language that step is already written in. Never translate a step.
- Do not change unrelated ingredients.
- Return ONLY data matching the schema.`;

const REWRITE_SCHEMA = {
  type: 'object',
  properties: {
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['step', 'text'],
      },
    },
  },
  required: ['instructions'],
};

export function isSubstitutionLanguageCode(value: string): value is SubstitutionLanguageCode {
  return (SUBSTITUTION_LANGUAGE_CODES as readonly string[]).includes(value);
}

export async function suggestSubstitutionsWithLlm(
  input: SuggestSubstitutionInput,
): Promise<{ alternatives: SubstitutionAlternative[]; usage: LlmUsageSnapshot | null }> {
  const { data, usage } = await generateLlmJson<{ alternatives: SubstitutionAlternative[] }>({
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text: buildTextContext(input) }],
    responseSchema: SUBSTITUTION_SCHEMA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: 'substitution',
    context: 'substitution.ts: suggestSubstitutionsWithLlm',
  });

  return {
    alternatives: (data.alternatives ?? []).map((alt) => {
    const dual = normalizeDualIngredient({
      name: alt.name ?? '',
      quantity: Number(alt.quantity),
      unit: alt.unit ?? '',
      metric: alt.metric,
      spoons: alt.spoons,
    });
    return {
      name: dual.name,
      quantity: dual.quantity,
      unit: dual.unit,
      ...(dual.metric ? { metric: dual.metric } : {}),
      ...(dual.spoons ? { spoons: dual.spoons } : {}),
      reason: sanitizeLlmText(alt.reason ?? ''),
    };
  }),
    usage,
  };
}

/** A rewritten step must keep at least this share of the words of the step it replaces. */
const MIN_WORDS_KEPT = 0.3;
/** Steps with fewer words than this are too short to compare. */
const MIN_WORDS_TO_COMPARE = 4;

/** Words of four letters or more. Shorter ones are mostly "the", "and", "for", which any two steps share. */
const wordsOf = (text: string) => new Set(text.toLowerCase().match(/[\p{L}\p{M}]{4,}/gu) ?? []);

/** True when the text names the ingredient by any of its words ("chicken" for "boneless chicken breast"). */
function mentions(text: string, ingredient: string): boolean {
  const name = ingredient.trim().toLowerCase();
  const words = name.match(/[\p{L}\p{M}]{3,}/gu) ?? (name ? [name] : []);
  const lower = text.toLowerCase();
  return words.some((word) => lower.includes(word));
}

/**
 * False when `rewritten` is something else than `original`: a note about the swap, another step, or the step in
 * another language. A rewrite keeps most of a step's words. The one step that may be redone from scratch is a step
 * about the swapped ingredient (boiling pasta becomes frying courgette), and then it has to be about the substitute.
 */
function isSameStep(original: string, rewritten: string, swap: { from: string; to: string }): boolean {
  const before = wordsOf(original);
  if (before.size < MIN_WORDS_TO_COMPARE) return true;
  const after = wordsOf(rewritten);
  let kept = 0;
  for (const word of before) if (after.has(word)) kept++;
  if (kept / before.size >= MIN_WORDS_KEPT) return true;
  return mentions(original, swap.from) && mentions(rewritten, swap.to);
}

/**
 * Holds the model's rewrite to the steps it was given (PIN-186: the apps save what comes back, so a dropped step
 * was lost for good). Accepted only with the same number of steps, each still the step in that place. Step numbers
 * are the cook's own, and an empty step keeps its text. Otherwise `refused` says why, and the apps swap the
 * ingredient's name in the steps themselves.
 *
 * The word check catches a step replaced by something else (a note, or the step in another language). It can't
 * catch a note that reuses most of the step's words, or one that names the substitute in place of a step about the
 * old ingredient.
 */
export function keepStepShape(
  original: { step: number; text: string }[],
  rewritten: { step?: unknown; text?: unknown }[],
  swap: { from: string; to: string },
): { instructions: { step: number; text: string }[] } | { refused: string } {
  if (rewritten.length !== original.length) {
    return { refused: `Rewrite has ${rewritten.length} steps, the recipe has ${original.length}` };
  }
  const instructions: { step: number; text: string }[] = [];
  for (const [index, source] of original.entries()) {
    const raw = rewritten[index]?.text;
    const text = (typeof raw === 'string' ? raw : '').trim() || source.text;
    if (!isSameStep(source.text, text, swap)) return { refused: `Rewrite replaced step ${source.step}` };
    instructions.push({ step: source.step, text });
  }
  return { instructions };
}

/**
 * Patches step text after the user applies a substitute. `instructions` is empty when the model's answer can't be
 * used; `refused` then says why, unless the answer was simply empty.
 */
export async function rewriteInstructionsForSubstitutionWithLlm(
  input: RewriteInstructionsForSubstitutionInput,
): Promise<{ instructions: { step: number; text: string }[]; usage: LlmUsageSnapshot | null; refused?: string }> {
  if (input.instructions.length === 0) return { instructions: [], usage: null };

  const { data, usage } = await generateLlmJson<{
    instructions: { step: number; text: string }[];
  }>({
    systemPrompt: REWRITE_SYSTEM_PROMPT,
    parts: [{ text: buildRewriteContext(input) }],
    responseSchema: REWRITE_SCHEMA,
    timeoutMs: REWRITE_TIMEOUT_MS,
    maxOutputTokens: REWRITE_MAX_OUTPUT_TOKENS,
    kind: 'substitution',
    context: 'substitution.ts: rewriteInstructionsForSubstitutionWithLlm',
  });

  const rewritten = (data.instructions ?? []).map((step) => ({ text: sanitizeLlmText(step.text ?? '') }));
  if (rewritten.length === 0) return { instructions: [], usage };
  const kept = keepStepShape(input.instructions, rewritten, { from: input.ingredient.name, to: input.alternative.name });
  return 'refused' in kept ? { instructions: [], usage, refused: kept.refused } : { instructions: kept.instructions, usage };
}

function buildTextContext(input: SuggestSubstitutionInput): string {
  const parts: string[] = [];
  const locale = resolveLocaleGuidance(input.language, input.ingredient.name);

  parts.push(`Recipe: ${input.recipeTitle}`);
  parts.push(
    `Ingredient to substitute: ${input.ingredient.quantity} ${input.ingredient.unit || ''} ${input.ingredient.name}`.trim(),
  );
  parts.push(`Target language for names + reasons: ${locale.languageName}`);
  parts.push(`Cook's grocery market: ${locale.market}`);
  parts.push(
    `Prefer common supermarket staples for that market (examples of the right vibe: ${locale.examples}).`,
  );
  parts.push(
    'Do NOT suggest specialty/import-only items that the average shopper cannot find on a normal supermarket shelf.',
  );

  if (input.otherIngredients.length > 0) {
    const others = input.otherIngredients.slice(0, 25).join(', ');
    parts.push(`Other ingredients in the recipe: ${others}`);
  }

  return parts.join('\n');
}

function buildRewriteContext(input: RewriteInstructionsForSubstitutionInput): string {
  // The steps' own language wins over the app's label: a recipe labelled English with Spanish steps came back as a
  // mix of both when the label was an order (PIN-186).
  const label = input.language ? MARKET_CONTEXT[input.language].languageName : null;
  const lines: string[] = [];

  if (input.recipeTitle?.trim()) {
    lines.push(`Recipe: ${input.recipeTitle.trim()}`);
  }
  lines.push(
    `Old ingredient: ${input.ingredient.quantity} ${input.ingredient.unit || ''} ${input.ingredient.name}`.trim(),
  );
  lines.push(
    `New ingredient: ${input.alternative.quantity} ${input.alternative.unit || ''} ${input.alternative.name}`.trim(),
  );
  lines.push(
    label
      ? `The recipe is labelled ${label}. Keep every step in the language it is written in now, even if that is another one.`
      : 'Keep every step in the language it is written in now.',
  );
  lines.push('\n--- INSTRUCTIONS ---');
  for (const step of input.instructions) {
    lines.push(`${step.step}. ${step.text}`);
  }
  return lines.join('\n');
}

function resolveLocaleGuidance(
  language: SubstitutionLanguageCode | null | undefined,
  ingredientName: string,
): { languageName: string; market: string; examples: string } {
  if (language && MARKET_CONTEXT[language]) {
    return MARKET_CONTEXT[language];
  }

  // No explicit translation language — infer from script of the ingredient name.
  if (/[\u0590-\u05FF]/.test(ingredientName)) return MARKET_CONTEXT.he;
  if (/[\u0600-\u06FF]/.test(ingredientName)) return MARKET_CONTEXT.ar;
  if (/[\u0400-\u04FF]/.test(ingredientName)) return MARKET_CONTEXT.ru;

  // Latin script, no language sent: older apps. A vague "same language" let the model answer an English recipe
  // in Spanish, so name the rule exactly and make English the default.
  return {
    languageName:
      'the language the recipe title and the ingredient name are written in (English if they are in English or it is unclear); never switch to another language',
    market: MARKET_CONTEXT.en.market,
    examples: MARKET_CONTEXT.en.examples,
  };
}

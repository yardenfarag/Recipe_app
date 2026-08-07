// Ingredient substitution via Gemini's generateContent REST endpoint.

import { generateGeminiJson, sanitizeGeminiText } from './geminiClient.ts';

const REQUEST_TIMEOUT_MS = 20_000;
const REWRITE_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 1_024;
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
          reason: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit', 'reason'],
      },
    },
  },
  required: ['alternatives'],
};

export interface SubstitutionAlternative {
  name: string;
  quantity: number;
  unit: string;
  reason: string;
}

export interface SuggestSubstitutionInput {
  ingredient: { name: string; quantity: number; unit: string };
  recipeTitle: string;
  otherIngredients: string[];
  /** Active recipe language when known; otherwise Gemini infers from ingredient text. */
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
- Keep the same number of steps, the same order, and the same language as the input steps.
- Change only steps that mention the old ingredient or need a technique tweak for the substitute.
- Do not invent new steps, remove steps, or change unrelated ingredients.
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

export async function suggestSubstitutionsWithGemini(
  input: SuggestSubstitutionInput,
): Promise<SubstitutionAlternative[]> {
  const { data } = await generateGeminiJson<{ alternatives: SubstitutionAlternative[] }>({
    tier: 'fast',
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text: buildTextContext(input) }],
    responseSchema: SUBSTITUTION_SCHEMA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: 'substitution',
    context: 'substitution.ts: suggestSubstitutionsWithGemini',
  });

  return (data.alternatives ?? []).map((alt) => ({
    name: sanitizeGeminiText(alt.name ?? ''),
    quantity: Number(alt.quantity),
    unit: sanitizeGeminiText(alt.unit ?? ''),
    reason: sanitizeGeminiText(alt.reason ?? ''),
  }));
}

/** Patches step text after the user applies a substitute (keeps step count/order). */
export async function rewriteInstructionsForSubstitutionWithGemini(
  input: RewriteInstructionsForSubstitutionInput,
): Promise<{ step: number; text: string }[]> {
  if (input.instructions.length === 0) return [];

  const { data } = await generateGeminiJson<{
    instructions: { step: number; text: string }[];
  }>({
    tier: 'fast',
    systemPrompt: REWRITE_SYSTEM_PROMPT,
    parts: [{ text: buildRewriteContext(input) }],
    responseSchema: REWRITE_SCHEMA,
    timeoutMs: REWRITE_TIMEOUT_MS,
    maxOutputTokens: REWRITE_MAX_OUTPUT_TOKENS,
    kind: 'substitution',
    context: 'substitution.ts: rewriteInstructionsForSubstitutionWithGemini',
  });

  return (data.instructions ?? []).map((step, index) => ({
    step: Number.isFinite(Number(step.step)) ? Number(step.step) : index + 1,
    text: sanitizeGeminiText(step.text ?? ''),
  }));
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
  const locale = resolveLocaleGuidance(input.language, input.ingredient.name);
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
  lines.push(`Keep steps in: ${locale.languageName}`);
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

  return {
    languageName: 'the same language as the ingredient name',
    market:
      'a typical supermarket for speakers of that language (default to a common Western supermarket if unclear)',
    examples: 'flour, yogurt, vegetable oil, chicken stock, sugar, baking powder',
  };
}

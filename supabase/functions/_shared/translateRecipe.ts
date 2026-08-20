// Translate recipe title / ingredients / instructions via Gemini structured output.

import {
  isKnownCulinaryUnit,
  localizeCulinaryUnit,
} from './culinaryUnits.ts';
import {
  generateGeminiJson,
  sanitizeGeminiText,
} from './geminiClient.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';
import { assertTranslationIdentity } from './translationIntegrity.ts';

const REQUEST_TIMEOUT_MS = 45_000;
const MAX_OUTPUT_TOKENS = 8_192;

export const TRANSLATE_LANGUAGE_CODES = ['en', 'es', 'he', 'ru', 'ar', 'de', 'fr'] as const;
export type TranslateLanguageCode = (typeof TRANSLATE_LANGUAGE_CODES)[number];

const LANGUAGE_NAMES: Record<TranslateLanguageCode, string> = {
  en: 'English',
  es: 'Spanish',
  he: 'Hebrew',
  ru: 'Russian',
  ar: 'Arabic',
  de: 'German',
  fr: 'French',
};

const SYSTEM_PROMPT = `You are a professional culinary translator.

Rules:
- Translate the recipe title, ingredient names, units, and instruction text into the target language.
- Preserve every ingredient and instruction in its original order.
- Copy each immutable source_index exactly; never renumber or reorder it.
- Keep quantities exactly unchanged. Do not convert measurement systems.
- ALWAYS translate unit words into natural culinary units in the target language (e.g. cup→כוס/taza, tbsp→כף/cucharada, g→גרם).
- For countable items whose unit is "unit", "pc", "piece", "each", or similar placeholders, set unit to an empty string — recipes just show the number next to the ingredient name.
- Preserve step order and step numbers.
- Do not add, remove, or invent ingredients or steps.
- Do not change cooking meaning, temperatures, or timing cues.
- Keep brand names and proper nouns recognizable when no standard translation exists.
- Return ONLY data matching the schema.`;

const TRANSLATE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_index: { type: 'integer' },
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['source_index', 'name', 'quantity', 'unit'],
      },
    },
    instructions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source_index: { type: 'integer' },
          step: { type: 'integer' },
          text: { type: 'string' },
        },
        required: ['source_index', 'step', 'text'],
      },
    },
  },
  required: ['title', 'ingredients', 'instructions'],
};

export interface TranslateRecipeInput {
  targetLanguage: TranslateLanguageCode;
  title: string;
  ingredients: {
    name: string;
    quantity: number;
    unit: string;
    metric?: { quantity: number; unit: string };
    spoons?: { quantity: number; unit: string };
  }[];
  instructions: { step: number; text: string; timestamp_seconds?: number }[];
}

export interface TranslatedRecipe {
  title: string;
  ingredients: {
    name: string;
    quantity: number;
    unit: string;
    metric?: { quantity: number; unit: string };
    spoons?: { quantity: number; unit: string };
  }[];
  instructions: { step: number; text: string }[];
  usage?: GeminiUsageSnapshot | null;
}

interface GeminiTranslatedRecipe {
  title: string;
  ingredients: {
    source_index: number;
    name: string;
    quantity: number;
    unit: string;
  }[];
  instructions: {
    source_index: number;
    step: number;
    text: string;
  }[];
}

export function isTranslateLanguageCode(value: string): value is TranslateLanguageCode {
  return (TRANSLATE_LANGUAGE_CODES as readonly string[]).includes(value);
}

export async function translateRecipeWithGemini(
  input: TranslateRecipeInput,
): Promise<TranslatedRecipe> {
  const targetName = LANGUAGE_NAMES[input.targetLanguage];
  const text = buildTextContext(input, targetName);

  const { data: parsed, usage } = await generateGeminiJson<GeminiTranslatedRecipe>({
    tier: 'fast',
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text }],
    responseSchema: TRANSLATE_SCHEMA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: 'translate',
    context: 'translateRecipe.ts: translateRecipeWithGemini',
  });

  const title = sanitizeGeminiText(parsed.title?.trim() ?? '');
  const ingredients = parsed.ingredients ?? [];
  const instructions = parsed.instructions ?? [];

  if (!title) {
    throw new Error('Translation response did not preserve the complete recipe');
  }
  // Validate immutable identity before rebuilding from source values. Length
  // checks alone cannot detect same-length reordering by the model.
  assertTranslationIdentity(
    input.ingredients,
    input.instructions,
    ingredients,
    instructions,
  );

  const translatedIngredients = input.ingredients.map((source, index) => {
    const translated = ingredients[index];
    const name = sanitizeGeminiText(translated?.name ?? '').trim();
    if (!name) {
      throw new Error(`Translation response omitted ingredient ${index + 1}`);
    }
    const sourceUnit = source.unit ?? '';
    const rawUnit = sanitizeGeminiText(translated?.unit ?? sourceUnit);
    return {
      name,
      quantity: source.quantity,
      unit: resolveTranslatedUnit(
        sourceUnit,
        rawUnit,
        input.targetLanguage,
        source.quantity,
      ),
      ...(source.metric ? { metric: source.metric } : {}),
      ...(source.spoons ? { spoons: source.spoons } : {}),
    };
  });

  const translatedInstructions = input.instructions.map((source, index) => {
    const text = sanitizeGeminiText(instructions[index]?.text ?? '').trim();
    if (!text) {
      throw new Error(`Translation response omitted instruction ${index + 1}`);
    }
    return {
      step: source.step,
      text,
      ...(source.timestamp_seconds != null
        ? { timestamp_seconds: source.timestamp_seconds }
        : {}),
    };
  });

  return {
    title,
    ingredients: translatedIngredients,
    instructions: translatedInstructions,
    usage,
  };
}

/**
 * Prefer localizing the source unit (stable for grams/spoons reverse-map).
 * Fall back to Gemini's unit for freeform measurements outside UNIT_MAP.
 */
function resolveTranslatedUnit(
  sourceUnit: string,
  geminiUnit: string,
  language: TranslateLanguageCode,
  quantity: number,
): string {
  const source = sourceUnit.trim();
  const gemini = geminiUnit.trim();
  if (source && isKnownCulinaryUnit(source)) {
    return localizeCulinaryUnit(source, language, quantity);
  }
  if (gemini && isKnownCulinaryUnit(gemini)) {
    return localizeCulinaryUnit(gemini, language, quantity);
  }
  return gemini || source;
}

function buildTextContext(input: TranslateRecipeInput, targetName: string): string {
  const lines: string[] = [
    `Translate this recipe into ${targetName}.`,
    `\nTitle: ${input.title}`,
    '\n--- INGREDIENTS ---',
  ];

  for (const [index, ing] of input.ingredients.entries()) {
    lines.push(
      `- source_index=${index} | quantity=${ing.quantity} | unit=${ing.unit} | name=${ing.name}`,
    );
  }

  lines.push('\n--- INSTRUCTIONS ---');
  for (const [index, step] of input.instructions.entries()) {
    lines.push(`source_index=${index} | step=${step.step} | text=${step.text}`);
  }

  return lines.join('\n');
}

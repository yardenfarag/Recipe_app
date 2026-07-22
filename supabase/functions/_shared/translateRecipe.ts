// Translate recipe title / ingredients / instructions via Gemini structured output.

import { localizeCulinaryUnit } from './culinaryUnits.ts';
import {
  generateGeminiJson,
  sanitizeGeminiText,
} from './geminiClient.ts';
import type { GeminiUsageSnapshot } from './pricing.ts';

const REQUEST_TIMEOUT_MS = 25_000;
const MAX_OUTPUT_TOKENS = 2_048;

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
- Keep quantities as numbers.
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
          name: { type: 'string' },
          quantity: { type: 'number' },
          unit: { type: 'string' },
        },
        required: ['name', 'quantity', 'unit'],
      },
    },
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
  required: ['title', 'ingredients', 'instructions'],
};

export interface TranslateRecipeInput {
  targetLanguage: TranslateLanguageCode;
  title: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
}

export interface TranslatedRecipe {
  title: string;
  ingredients: { name: string; quantity: number; unit: string }[];
  instructions: { step: number; text: string }[];
  usage?: GeminiUsageSnapshot | null;
}

export function isTranslateLanguageCode(value: string): value is TranslateLanguageCode {
  return (TRANSLATE_LANGUAGE_CODES as readonly string[]).includes(value);
}

export async function translateRecipeWithGemini(
  input: TranslateRecipeInput,
): Promise<TranslatedRecipe> {
  const targetName = LANGUAGE_NAMES[input.targetLanguage];
  const text = buildTextContext(input, targetName);

  const { data: parsed, usage } = await generateGeminiJson<TranslatedRecipe>({
    tier: 'fast',
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text }],
    responseSchema: TRANSLATE_SCHEMA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: 'translate',
    context: 'translateRecipe.ts: translateRecipeWithGemini',
  });

  return {
    title: sanitizeGeminiText(parsed.title?.trim() || input.title),
    ingredients: (parsed.ingredients ?? []).map((ing, index) => {
      const quantity = Number(ing.quantity);
      const fallbackUnit = input.ingredients[index]?.unit ?? ing.unit ?? '';
      const rawUnit = sanitizeGeminiText(ing.unit ?? fallbackUnit);
      return {
        name: sanitizeGeminiText(ing.name ?? ''),
        quantity,
        unit: localizeCulinaryUnit(rawUnit || fallbackUnit, input.targetLanguage, quantity),
      };
    }),
    instructions: (parsed.instructions ?? []).map((step) => {
      const stepNumber = Number(step.step);
      const original = input.instructions.find((row) => row.step === stepNumber);
      return {
        step: stepNumber,
        text: sanitizeGeminiText(step.text ?? ''),
        ...(original?.timestamp_seconds != null
          ? { timestamp_seconds: original.timestamp_seconds }
          : {}),
      };
    }),
    usage,
  };
}

function buildTextContext(input: TranslateRecipeInput, targetName: string): string {
  const lines: string[] = [
    `Translate this recipe into ${targetName}.`,
    `\nTitle: ${input.title}`,
    '\n--- INGREDIENTS ---',
  ];

  for (const ing of input.ingredients) {
    lines.push(`- ${ing.quantity} ${ing.unit} ${ing.name}`);
  }

  lines.push('\n--- INSTRUCTIONS ---');
  for (const step of input.instructions) {
    lines.push(`${step.step}. ${step.text}`);
  }

  return lines.join('\n');
}

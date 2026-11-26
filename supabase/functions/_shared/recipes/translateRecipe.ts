// Translate recipe title / ingredients / instructions through the `translate` task model (structured output).

import {
  isKnownCulinaryUnit,
  localizeCulinaryUnit,
} from './culinaryUnits.ts';
import { generateLlmJson } from '../llm/llmClient.ts';
import { sanitizeLlmText } from '../llm/llmClient.ts';
import type { LlmUsageSnapshot } from '../llm/pricing.ts';
import { assertTranslationIdentity } from './translationIntegrity.ts';
import { glossaryFor } from './translationGlossary.ts';

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

/**
 * Bump when the prompt, the glossary or the unit handling changes enough that old translations should be redone.
 * Saved on each `recipe_translations` row; the app treats a lower or missing version as a cache miss (PIN-53).
 *  1: before PIN-53 (Gemini Flash Lite, then GPT-6.1 Sol with the first prompt)
 *  2: PIN-53: units never fall back to the source, per-language style, glossary, numbers kept for display conversion
 */
export const TRANSLATION_VERSION = 2;

const SYSTEM_PROMPT = `You are a professional culinary translator. The translation must read as if a cook wrote the recipe in the target language.

Rules:
- Translate every word of the title, ingredient names, units and steps into the target language. Brand names may stay as they are. Never keep the source text in parentheses next to the translation.
- Preserve every ingredient and instruction in its original order. Copy each immutable source_index exactly; never renumber or reorder.
- Keep quantities exactly unchanged.
- Keep every number in the steps as written, with its scale or unit: 350°F stays 350°F, 180°C stays 180°C, a 9-inch pan stays 9 inches (with the unit word in the target language). Do not convert anything: the app converts temperatures, weights and sizes for each reader. When the source says only "degrees", write the scale it means (°F in an American recipe, °C otherwise).
- unit: translate the unit word into the natural culinary unit of the target language (cup→כוס/taza, tbsp→כף/cucharada, g→גרם). Set unit to "" only for count placeholders ("unit", "pc", "piece", "each", "יחידה", "adet", "Stück", "шт.") or when the unit just repeats the ingredient ("1 lemon | lemon", "3 ביצים | ביצים"). Never return a unit in the source language.
- name: the ingredient only. Don't repeat the unit or a phrase that is already in unit ("for frying", "to taste", "pack").
- The app shows each ingredient as "<amount> <unit> <name>", so write the name to follow an amount (see the language notes).
- The title is a natural recipe name a cook in the target language would use, not a word-for-word copy.
- Do not add, remove or invent ingredients or steps. Do not change cooking meaning, temperatures or timing cues.
- Use one style for the whole recipe (see the language notes), and the same word for the same ingredient in the list and the steps.
- When a glossary is given, use its terms.
- Return ONLY data matching the schema.`;

/** House style per target language (PIN-53). Decided with Yarden: Hebrew present plural, Spanish from Spain. */
const STYLE_NOTES: Partial<Record<TranslateLanguageCode, string>> = {
  he: `Hebrew (Israel):
- Every step in the impersonal present plural: מחממים, מערבבים, אופים, מוסיפים. Never the imperative (חממו, ערבבו) and never יש + infinitive.
- Names Israeli shops and cooks use (שמנת מתוקה, קמח תופח, סודה לשתייה, אבקת אפייה, קורנפלור, שוקולד צ׳יפס).
- Correct gender and number agreement; "2 שיני שום", not "2 שיניים שום".`,
  ar: `Arabic (Modern Standard, as on Arab recipe sites):
- Every step in the masculine singular imperative: اخلط، سخّن، أضف.
- After a fraction or the number 2 the unit is singular: "½ كوب", "2 ملعقة كبيرة".`,
  ru: `Russian:
- Every step in the polite imperative: Разогрейте, смешайте, выпекайте.
- Ingredient names in lower case (except brand names), in the genitive case because they follow the amount: "200 г муки", "2 ст. л. сахара", "1 стакан молока", "3 яйца".`,
  es: `Spanish (Spain):
- Vocabulary from Spain: patata, zumo, nata, levadura química, azúcar glas, bol, horno, maicena.
- Every step in the tú imperative (mezcla, hornea, añade); vosotros only where the source speaks to several people.`,
  en: `English (American):
- American terms: heavy cream, all-purpose flour, cornstarch, baking soda, zucchini, cilantro.
- Ingredient names in lower case unless a brand. Every step in the imperative.`,
};

/** One short, hand-checked example per language, for the style (Vilar et al. 2023: example quality matters most). */
const EXAMPLES: Partial<Record<TranslateLanguageCode, string>> = {
  he: `Example (English → Hebrew):
- quantity=0.5 | unit=cup | name=heavy cream → unit=כוס | name=שמנת מתוקה
- quantity=2 | unit=pieces | name=garlic cloves, minced → unit="" | name=שיני שום כתושות
- "Preheat the oven to 350°F and fold in the flour." → "מחממים את התנור ל-350°F ומקפלים פנימה את הקמח."`,
  ar: `Example (English → Arabic):
- quantity=0.5 | unit=cup | name=brown sugar → unit=كوب | name=سكر بني
- "Preheat the oven to 350°F and fold in the flour." → "سخّن الفرن إلى 350°F وقلّب الدقيق برفق."`,
  ru: `Example (English → Russian):
- quantity=200 | unit=g | name=Flour → unit=г | name=муки
- quantity=1 | unit=cup | name=whole milk → unit=стакан | name=цельного молока
- "Preheat the oven to 350°F and fold in the flour." → "Разогрейте духовку до 350°F и аккуратно вмешайте муку."`,
  es: `Example (English → Spanish):
- quantity=0.5 | unit=cup | name=heavy cream → unit=taza | name=nata para montar
- "Preheat the oven to 350°F and fold in the flour." → "Precalienta el horno a 350°F e incorpora la harina con movimientos envolventes."`,
  en: `Example (Hebrew → English):
- quantity=1 | unit=כוס | name=גבינה לבנה → unit=cup | name=quark (soft white cheese)
- quantity=1 | unit=קישוא | name=קישוא → unit="" | name=zucchini
- "מחממים תנור ל-180 מעלות." → "Preheat the oven to 180°C."`,
};

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
  usage?: LlmUsageSnapshot | null;
}

interface TranslatedRecipeJson {
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

/** `translate` when a cook waits for it (translate-recipe); `translate_background` when nobody does (PIN-77). */
export type TranslateTaskKind = 'translate' | 'translate_background';

export async function translateRecipeWithLlm(
  input: TranslateRecipeInput,
  options: { kind?: TranslateTaskKind } = {},
): Promise<TranslatedRecipe> {
  const targetName = LANGUAGE_NAMES[input.targetLanguage];
  const text = buildTextContext(input, targetName);

  const { data: parsed, usage } = await generateLlmJson<TranslatedRecipeJson>({
    systemPrompt: SYSTEM_PROMPT,
    parts: [{ text }],
    responseSchema: TRANSLATE_SCHEMA,
    timeoutMs: REQUEST_TIMEOUT_MS,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    kind: options.kind ?? 'translate',
    context: 'translateRecipe.ts: translateRecipeWithLlm',
  });

  const title = sanitizeLlmText(parsed.title?.trim() ?? '');
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
    const name = sanitizeLlmText(translated?.name ?? '').trim();
    if (!name) {
      throw new Error(`Translation response omitted ingredient ${index + 1}`);
    }
    const sourceUnit = source.unit ?? '';
    // The model's unit as given: "" is its answer for a count ("1 lemon"), not a gap to fill with the source unit.
    const rawUnit = sanitizeLlmText(typeof translated?.unit === 'string' ? translated.unit : '');
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
    const text = sanitizeLlmText(instructions[index]?.text ?? '').trim();
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
 * Prefer localizing the source unit (stable for grams/spoons reverse-map). Otherwise use the model's unit, including
 * an empty one. An unknown source unit the model dropped is a placeholder or a repeat of the name, so the number
 * stands alone (PIN-53: falling back to the source put "קישוא", "adet" and "green cabbage" next to translated names).
 */
export function resolveTranslatedUnit(
  sourceUnit: string,
  modelUnit: string,
  language: TranslateLanguageCode,
  quantity: number,
): string {
  const source = sourceUnit.trim();
  const model = modelUnit.trim();
  if (source && isKnownCulinaryUnit(source)) {
    return localizeCulinaryUnit(source, language, quantity);
  }
  if (model && isKnownCulinaryUnit(model)) {
    return localizeCulinaryUnit(model, language, quantity);
  }
  return model;
}

const LANGUAGE_MARKERS: Partial<Record<TranslateLanguageCode, RegExp>> = {
  en: /\b(?:the|and|with|until|minutes|add|mix|bake|into|cup|cups|tablespoons?|teaspoons?|preheat|stir|heat)\b/g,
  es: /(?:^|[^\p{L}])(?:el|la|los|las|con|hasta|minutos|añade|añadir|mezcla|hornea|taza|cucharada|cucharadita|precalienta)(?![\p{L}])/gu,
  de: /(?:^|[^\p{L}])(?:und|mit|bis|minuten|den|die|das|backen|hinzufügen|esslöffel|teelöffel)(?![\p{L}])/gu,
  fr: /(?:^|[^\p{L}])(?:et|avec|jusqu|ajoutez|mélangez|cuillère|four|faites)(?![\p{L}])/gu,
};

/**
 * True when the recipe is already written in `language`, so translating would only return it (PIN-53: recipes
 * labelled with the wrong source language were "translated" into their own language). Script languages need nine
 * letters in ten in their script; Latin ones need no other script and clearly more of their own common words than
 * any other Latin language's.
 */
export function recipeAlreadyInLanguage(
  input: Pick<TranslateRecipeInput, 'title' | 'ingredients' | 'instructions'>,
  language: TranslateLanguageCode,
): boolean {
  const text = [input.title, ...input.ingredients.map((i) => `${i.unit} ${i.name}`), ...input.instructions.map((s) => s.text)]
    .join(' \n ')
    .toLowerCase();
  const letters = text.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 20) return false;
  const count = (re: RegExp) => text.match(re)?.length ?? 0;
  if (language === 'he' || language === 'ar' || language === 'ru') {
    const script = { he: /[֐-׿]/gu, ar: /[؀-ۿ]/gu, ru: /[Ѐ-ӿ]/gu }[language];
    return count(script) / letters >= 0.9;
  }
  if (/[֐-׿؀-ۿЀ-ӿ]/u.test(text)) return false;
  const own = LANGUAGE_MARKERS[language];
  if (!own) return false;
  const ownHits = count(own);
  const otherHits = Math.max(
    0,
    ...Object.entries(LANGUAGE_MARKERS)
      .filter(([code]) => code !== language)
      .map(([, re]) => count(re)),
  );
  return ownHits >= 4 && ownHits >= otherHits * 3;
}

function buildTextContext(input: TranslateRecipeInput, targetName: string): string {
  const lines: string[] = [`Translate this recipe into ${targetName}.`];
  const style = STYLE_NOTES[input.targetLanguage];
  if (style) lines.push(`\n--- LANGUAGE NOTES ---\n${style}`);
  const example = EXAMPLES[input.targetLanguage];
  if (example) lines.push(`\n${example}`);
  const glossary = glossaryFor(
    [input.title, ...input.ingredients.map((i) => i.name), ...input.instructions.map((s) => s.text)].join('\n'),
    input.targetLanguage,
  );
  if (glossary.length > 0) lines.push(`\n--- GLOSSARY ---\n${glossary.join('\n')}`);
  lines.push(`\nTitle: ${input.title}`, '\n--- INGREDIENTS ---');

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

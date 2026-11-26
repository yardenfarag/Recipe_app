/**
 * Every extracted recipe in every app language (PIN-77), made after extract-recipe has answered the app, so a cook
 * sees their own language straight away instead of waiting for a translation on open.
 *
 * - A Hub card (published now or already there) gets the app languages it is missing, except its own, stored in
 *   recipe_card_translations for every cook who reads or saves it. A card translated before costs nothing.
 * - The cook's copy (signed-in only: guests save on the device) gets every app language but its own. When the card
 *   has the same text, the card's translations serve it too; otherwise (no card, the cook doesn't share, the card's
 *   text differs) the recipe is translated on its own. They go to `remember_recipe_translations`, and the cook's copy
 *   takes them when it is saved, or straight away if it already was.
 * - A recipe saved from the Hub takes its card's translations in the database (the recipes insert trigger).
 *
 * Languages are translated in parallel. Full extractions only: a partial one goes to the editor.
 */
import type { Db } from '../../core/supabaseAdmin.ts';
import { toJson } from '../../core/supabaseAdmin.ts';
import { logUsageEvent } from '../../core/usageLog.ts';
import type { LlmUsageSnapshot } from '../../llm/pricing.ts';
import type { HubPublishDecision } from '../recipeCards.ts';
import {
  TRANSLATION_VERSION,
  type TranslatedRecipe,
  translateRecipeWithLlm,
  type TranslateRecipeInput,
} from '../translateRecipe.ts';
import {
  type AppLanguage,
  isAppLanguage,
  languagesToTranslate,
  sameTranslationText,
  sourceLanguageOf,
  type StoredRecipeText,
  type TranslationContent,
  translateOrKeep,
  translationSourceFrom,
} from '../translationTargets.ts';

export type CardTranslationsState = {
  id: string;
  text: StoredRecipeText;
  /** The card's translations made by the current translator (older ones count as missing and are made again). */
  translations: Partial<Record<AppLanguage, TranslationContent>>;
};

export type TranslationsOnSaveDeps = {
  /** The card's text and translations; null when it is gone or hidden. */
  readCard: (cardId: string) => Promise<CardTranslationsState | null>;
  translate: (input: TranslateRecipeInput) => Promise<TranslatedRecipe>;
  saveCard: (cardId: string, language: AppLanguage, content: TranslationContent) => Promise<void>;
  /** Hands the cook's translations to their copy (remember_recipe_translations); the number copied into a saved one. */
  remember: (translations: Partial<Record<AppLanguage, TranslationContent>>) => Promise<number>;
};

export type TranslationsOutcome = {
  cardId: string | null;
  /** Made for the card (and, when its text is the recipe's, for the cook too). */
  cardLanguages: AppLanguage[];
  /** Handed to the cook's copy. */
  cookLanguages: AppLanguage[];
  /** The card's earlier translations handed to the cook, with no model call. */
  reusedFromCard: AppLanguage[];
  /** The card's text is the recipe's, so one translation serves both. */
  sharedWithCard: boolean;
  calls: number;
  failed: string[];
  usages: LlmUsageSnapshot[];
  /** Translations copied into a copy saved already; null when nothing was handed over. */
  remembered: number | null;
};

type Job = { language: AppLanguage; source: NonNullable<ReturnType<typeof translationSourceFrom>>; forCard: boolean; forCook: boolean };

/** What to translate after an extraction, and where it goes. Throws only when the card can't be read. */
export async function translationsAfterExtract(
  decision: HubPublishDecision,
  recipe: StoredRecipeText,
  userId: string | null,
  deps: TranslationsOnSaveDeps,
): Promise<TranslationsOutcome> {
  const outcome: TranslationsOutcome = {
    cardId: decision.status === 'skipped' ? null : decision.cardId,
    cardLanguages: [],
    cookLanguages: [],
    reusedFromCard: [],
    sharedWithCard: false,
    calls: 0,
    failed: [],
    usages: [],
    remembered: null,
  };
  const recipeSource = translationSourceFrom(recipe);
  const card = decision.status === 'skipped' ? null : await deps.readCard(decision.cardId);
  const cook: Partial<Record<AppLanguage, TranslationContent>> = {};
  const jobs: Job[] = [];

  if (card) {
    const cardSource = translationSourceFrom(card.text);
    outcome.sharedWithCard = recipeSource !== null && cardSource !== null && sameTranslationText(card.text, recipe);
    const forCook = outcome.sharedWithCard && userId !== null;
    if (cardSource) {
      const have = Object.keys(card.translations);
      for (const language of languagesToTranslate(sourceLanguageOf(card.text, cardSource), have)) {
        jobs.push({ language, source: cardSource, forCard: true, forCook });
      }
    }
    if (forCook) {
      for (const [language, content] of Object.entries(card.translations)) {
        if (!isAppLanguage(language) || !content) continue;
        cook[language] = content;
        outcome.reusedFromCard.push(language);
      }
    }
  }
  // Guests save on the device: only the card is worth translating for them.
  if (userId && recipeSource && !outcome.sharedWithCard) {
    for (const language of languagesToTranslate(sourceLanguageOf(recipe, recipeSource), [])) {
      jobs.push({ language, source: recipeSource, forCard: false, forCook: true });
    }
  }

  await Promise.all(jobs.map(async (job) => {
    const where = job.forCard ? 'card' : 'cook';
    let translated: TranslatedRecipe;
    try {
      translated = await translateOrKeep(job.source, job.language, deps.translate);
    } catch (error) {
      outcome.failed.push(`${where}/${job.language}: ${message(error)}`);
      return;
    }
    if (translated.usage) {
      outcome.calls += 1;
      outcome.usages.push(translated.usage);
    }
    const content: TranslationContent = {
      title: translated.title,
      ingredients: translated.ingredients,
      instructions: translated.instructions,
    };
    if (job.forCook) {
      cook[job.language] = content;
      outcome.cookLanguages.push(job.language);
    }
    if (job.forCard) {
      try {
        await deps.saveCard(card!.id, job.language, content);
        outcome.cardLanguages.push(job.language);
      } catch (error) {
        outcome.failed.push(`card/${job.language}: save failed: ${message(error)}`);
      }
    }
  }));

  outcome.cookLanguages.push(...outcome.reusedFromCard);
  if (userId && Object.keys(cook).length > 0) outcome.remembered = await deps.remember(cook);
  outcome.cardLanguages.sort();
  outcome.cookLanguages.sort();
  return outcome;
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

/** The Supabase side of the step. */
export function supabaseTranslationsOnSaveDeps(admin: Db, recipe: StoredRecipeText, userId: string | null): TranslationsOnSaveDeps {
  return {
    async readCard(cardId) {
      const { data: card, error } = await admin
        .from('recipe_cards')
        .select('id, title, ingredients, instructions, source_language, hidden_at')
        .eq('id', cardId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!card || card.hidden_at) return null;
      const { data: rows, error: rowsError } = await admin
        .from('recipe_card_translations')
        .select('language_code, title, ingredients, instructions, translation_version')
        .eq('card_id', cardId)
        .gte('translation_version', TRANSLATION_VERSION);
      if (rowsError) throw new Error(rowsError.message);
      const translations: CardTranslationsState['translations'] = {};
      for (const row of rows ?? []) {
        if (!isAppLanguage(row.language_code)) continue;
        translations[row.language_code] = {
          title: row.title,
          ingredients: row.ingredients as unknown as TranslationContent['ingredients'],
          instructions: row.instructions as unknown as TranslationContent['instructions'],
        };
      }
      return { id: card.id, text: card, translations };
    },
    translate: (input) => translateRecipeWithLlm(input, { kind: 'translate_background' }),
    async saveCard(cardId, language, content) {
      // Replaces only an older translator's row: readCard left the current ones out.
      const { error } = await admin.from('recipe_card_translations').upsert({
        card_id: cardId,
        language_code: language,
        title: content.title,
        ingredients: toJson(content.ingredients),
        instructions: toJson(content.instructions),
        translation_version: TRANSLATION_VERSION,
      }, { onConflict: 'card_id,language_code' });
      if (error) throw new Error(error.message);
    },
    async remember(translations) {
      const payload: Record<string, unknown> = {};
      for (const [language, content] of Object.entries(translations)) {
        payload[language] = { ...content, translation_version: TRANSLATION_VERSION };
      }
      const { data, error } = await admin.rpc('remember_recipe_translations', {
        p_user_id: userId!,
        p_title: typeof recipe.title === 'string' ? recipe.title : '',
        p_ingredients: toJson(recipe.ingredients ?? []),
        p_instructions: toJson(recipe.instructions ?? []),
        p_translations: toJson(payload),
      });
      if (error) throw new Error(error.message);
      return typeof data === 'number' ? data : 0;
    },
  };
}

/**
 * extract-recipe's step after the Hub decision: translate the recipe into every app language and hand the result to
 * the card and the cook's copy. Full extractions only. Logs one `recipe_translations` row. Never throws.
 */
export async function translateExtractedRecipe(
  admin: Db,
  decision: HubPublishDecision,
  recipe: StoredRecipeText,
  userId: string | null,
  full: boolean,
): Promise<void> {
  if (!full) return;
  const started = Date.now();
  try {
    const outcome = await translationsAfterExtract(decision, recipe, userId, supabaseTranslationsOnSaveDeps(admin, recipe, userId));
    if (outcome.cardLanguages.length === 0 && outcome.cookLanguages.length === 0 && outcome.failed.length === 0) return;
    const made = outcome.cardLanguages.length + outcome.cookLanguages.length;
    await logUsageEvent(admin, {
      userId,
      action: 'recipe_translations',
      status: outcome.failed.length === 0 ? 'ok' : made > 0 ? 'partial' : 'failed',
      usages: outcome.usages,
      tokensCharged: 0,
      durationMs: Date.now() - started,
      errorMessage: outcome.failed[0] ?? null,
      metadata: {
        version: TRANSLATION_VERSION,
        card_id: outcome.cardId,
        card_languages: outcome.cardLanguages,
        cook_languages: outcome.cookLanguages,
        reused_from_card: outcome.reusedFromCard,
        shared_with_card: outcome.sharedWithCard,
        calls: outcome.calls,
        remembered: outcome.remembered,
        failed: outcome.failed.slice(0, 10),
      },
    });
  } catch (error) {
    console.error('[recipe-translations] extract translations failed', error);
  }
}

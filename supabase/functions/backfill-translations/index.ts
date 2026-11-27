import { parseUuidCursor, readBackfillBody } from '../_shared/core/backfillRequest.ts';
import { handler, HttpError } from '../_shared/core/handler.ts';
import { type Db, toJson } from '../_shared/core/supabaseAdmin.ts';
import {
  clampMissingTranslationBatchSize,
  clampTranslationBatchSize,
  countMissingTranslations,
  type MissingTranslationDb,
  type MissingTranslationItem,
  type MissingTranslationTarget,
  parseTranslationCursor,
  runMissingTranslationBatch,
  runTranslationBackfillBatch,
  type StaleTranslationRow,
  TRANSLATION_COST_PER_ROW_USD,
  type TranslationBackfillDb,
  type TranslationCursor,
} from '../_shared/recipes/enrich/translationBackfill.ts';
import {
  isTranslateLanguageCode,
  recipeAlreadyInLanguage,
  type TranslateRecipeInput,
  TRANSLATION_VERSION,
  translateRecipeWithLlm,
} from '../_shared/recipes/translateRecipe.ts';
import { APP_LANGUAGES, translationSourceFrom } from '../_shared/recipes/translationTargets.ts';

interface RequestBody {
  /**
   * Omit (or "stale") to redo translations made before TRANSLATION_VERSION (PIN-53). "cards" / "recipes": fill the
   * app languages visible Hub cards / Library recipes don't have yet (PIN-77).
   */
  target?: unknown;
  /** next_cursor from the previous response; omit to start. Stale: { recipe_id, language_code }; cards/recipes: an id. */
  after?: unknown;
  /** Stale: 1–10, default 10 rows. Cards/recipes: 1–5, default 3 items (each up to four calls in parallel). */
  limit?: number;
  /** Only count what is to do (by language) and estimate the cost; no model calls, no writes. */
  dry_run?: boolean;
}

type JoinedRow = {
  recipe_id: string;
  language_code: string;
  translation_version: number | null;
  recipes: { title: string; ingredients: unknown; instructions: unknown } | null;
};

const STALE = `translation_version.is.null,translation_version.lt.${TRANSLATION_VERSION}`;

type Request =
  | { target: 'stale'; after: TranslationCursor | null; dryRun: boolean; limit: unknown }
  | { target: MissingTranslationTarget; after: string | null; dryRun: boolean; limit: unknown };

/** The request, checked in the old order. A body that isn't an object (`null`) throws a TypeError: a 500, as before. */
function parseRequest(raw: unknown): Request {
  const body = raw as RequestBody;
  const target = body.target ?? 'stale';
  if (target === 'cards' || target === 'recipes') {
    return { target, after: parseUuidCursor(body.after), dryRun: body.dry_run === true, limit: body.limit };
  }
  if (target !== 'stale') throw HttpError.legacy(400, 'target must be "stale", "cards" or "recipes"');
  const after = parseTranslationCursor(body.after);
  if (after === undefined) {
    throw HttpError.legacy(400, 'after must be a next_cursor value ({ recipe_id, language_code })');
  }
  return { target, after, dryRun: body.dry_run === true, limit: body.limit };
}

/** Background work: nobody waits, so it runs on the background translation model (PIN-77). */
async function translate(input: TranslateRecipeInput) {
  // Same shortcut as translate-recipe: text already in the target language is saved as is.
  return recipeAlreadyInLanguage(input, input.targetLanguage)
    ? { title: input.title, ingredients: input.ingredients, instructions: input.instructions, usage: null }
    : await translateRecipeWithLlm(input, { kind: 'translate_background' });
}

function supabaseTranslationDb(admin: Db): TranslationBackfillDb {
  return {
    async fetchStale(after, limit) {
      const cursor = after
        ? `,or(recipe_id.gt.${after.recipeId},and(recipe_id.eq.${after.recipeId},language_code.gt.${after.languageCode}))`
        : '';
      // One `or` holding an `and`, so the stale test and the cursor both apply.
      const { data, error } = await admin
        .from('recipe_translations')
        .select('recipe_id, language_code, translation_version, recipes!inner(title, ingredients, instructions)')
        .or(`and(or(${STALE})${cursor})`)
        .order('recipe_id', { ascending: true })
        .order('language_code', { ascending: true })
        .limit(limit);
      if (error) throw new Error(error.message);
      const rows: StaleTranslationRow[] = [];
      for (const row of (data ?? []) as unknown as JoinedRow[]) {
        const source = translationSourceFrom(row.recipes);
        if (!source) continue;
        rows.push({
          recipeId: row.recipe_id,
          languageCode: row.language_code,
          translationVersion: row.translation_version,
          source,
        });
      }
      return rows;
    },
    async countStale() {
      const { data, error } = await admin.from('recipe_translations').select('language_code').or(STALE);
      if (error) throw new Error(error.message);
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.language_code] = (counts[row.language_code] ?? 0) + 1;
      return counts;
    },
    async saveTranslation(row, content, version) {
      // A no-op when the app redid the row in the meantime.
      const { data, error } = await admin
        .from('recipe_translations')
        .update({
          title: content.title,
          ingredients: toJson(content.ingredients),
          instructions: toJson(content.instructions),
          translation_version: version,
        })
        .eq('recipe_id', row.recipeId)
        .eq('language_code', row.languageCode)
        .or(STALE)
        .select('recipe_id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

function groupLanguages(rows: { id: string; language_code: string }[]): Map<string, string[]> {
  const byId = new Map<string, string[]>();
  for (const row of rows) byId.set(row.id, [...(byId.get(row.id) ?? []), row.language_code]);
  return byId;
}

/**
 * Visible Hub cards. A translation by an older translator counts as missing and is replaced (cards' translations are
 * the server's own). At most 100 ids per read, so the `in` list and the five rows per card stay within PostgREST's
 * limits.
 */
function supabaseMissingCardsDb(admin: Db): MissingTranslationDb {
  return {
    async fetchItems(after, limit) {
      let query = admin
        .from('recipe_cards')
        .select('id, title, ingredients, instructions, source_language')
        .is('hidden_at', null)
        .order('id', { ascending: true })
        .limit(limit);
      if (after) query = query.gt('id', after);
      const { data: cards, error } = await query;
      if (error) throw new Error(error.message);
      if (!cards || cards.length === 0) return [];
      const { data: rows, error: rowsError } = await admin
        .from('recipe_card_translations')
        .select('card_id, language_code')
        .in('card_id', cards.map((card) => card.id))
        .gte('translation_version', TRANSLATION_VERSION);
      if (rowsError) throw new Error(rowsError.message);
      const have = groupLanguages((rows ?? []).map((row) => ({ id: row.card_id, language_code: row.language_code })));
      return cards.map((card): MissingTranslationItem => ({ id: card.id, text: card, have: have.get(card.id) ?? [] }));
    },
    async save(id, language, content, version) {
      const { error } = await admin.from('recipe_card_translations').upsert({
        card_id: id,
        language_code: language,
        title: content.title,
        ingredients: toJson(content.ingredients),
        instructions: toJson(content.instructions),
        translation_version: version,
      }, { onConflict: 'card_id,language_code' });
      if (error) throw new Error(error.message);
      return true;
    },
  };
}

/**
 * Library recipes. Any translation the recipe has counts, whatever its version: older ones are the "stale" target's
 * job, and one the app made in the meantime is never replaced.
 */
function supabaseMissingRecipesDb(admin: Db): MissingTranslationDb {
  return {
    async fetchItems(after, limit) {
      let query = admin
        .from('recipes')
        .select('id, title, ingredients, instructions, source_language')
        .order('id', { ascending: true })
        .limit(limit);
      if (after) query = query.gt('id', after);
      const { data: recipes, error } = await query;
      if (error) throw new Error(error.message);
      if (!recipes || recipes.length === 0) return [];
      const { data: rows, error: rowsError } = await admin
        .from('recipe_translations')
        .select('recipe_id, language_code')
        .in('recipe_id', recipes.map((recipe) => recipe.id))
        .in('language_code', [...APP_LANGUAGES]);
      if (rowsError) throw new Error(rowsError.message);
      const have = groupLanguages((rows ?? []).map((row) => ({ id: row.recipe_id, language_code: row.language_code })));
      return recipes.map((recipe): MissingTranslationItem => ({ id: recipe.id, text: recipe, have: have.get(recipe.id) ?? [] }));
    },
    async copyFromCards(ids) {
      const { data, error } = await admin.rpc('copy_card_translations_to_recipes', { p_recipe_ids: ids });
      if (error) throw new Error(error.message);
      const copied: Record<string, string[]> = {};
      for (const row of data ?? []) copied[row.recipe_id] = [...(copied[row.recipe_id] ?? []), row.language_code];
      return copied;
    },
    async save(id, language, content, version) {
      // Insert only: a translation that appeared since the read (the app's, or a save's) is kept.
      const { data, error } = await admin
        .from('recipe_translations')
        .upsert({
          recipe_id: id,
          language_code: language,
          title: content.title,
          ingredients: toJson(content.ingredients),
          instructions: toJson(content.instructions),
          translation_version: version,
        }, { onConflict: 'recipe_id,language_code', ignoreDuplicates: true })
        .select('recipe_id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
  };
}

const estimate = (rows: number) => Math.round(rows * TRANSLATION_COST_PER_ROW_USD * 100) / 100;

/**
 * Admin only, one batch per call; call again with `after: next_cursor` until it is null. Start with `dry_run: true`
 * to see how much is to do and what it should cost, and check the OpenRouter balance first.
 *  - POST { after?, limit?, dry_run? } translates again the cached translations made before TRANSLATION_VERSION
 *    (PIN-53).
 *  - POST { target: "cards" | "recipes", after?, limit?, dry_run? } fills the app languages (en, he, ar, ru, es) that
 *    visible Hub cards / Library recipes lack, except each one's own (PIN-77). Run "cards" first: a Library recipe
 *    from a card with the same text then takes the card's translations for free.
 */
handler(
  {
    name: 'backfill-translations',
    auth: 'admin',
    // Read below: Content-Length 0 is `{}`, an empty body without one is invalid JSON (readBackfillBody).
    body: 'none',
    legacyErrorShape: true,
    errors: { authInvalid: HttpError.legacy(401, 'Sign in required') },
  },
  async ({ req, admin, log }) => {
    const request = parseRequest(await readBackfillBody(req));
    const started = Date.now();
    try {
      if (request.target !== 'stale') {
        const { target, after, dryRun } = request;
        const db = target === 'cards' ? supabaseMissingCardsDb(admin) : supabaseMissingRecipesDb(admin);
        if (dryRun) {
          const counts = await countMissingTranslations(db);
          return {
            dry_run: true,
            target,
            version: TRANSLATION_VERSION,
            items: counts.items,
            missing: counts.missing,
            by_language: counts.byLanguage,
            // An upper bound for recipes: those whose Hub card has the same text are copied for free.
            estimated_cost_usd: estimate(counts.missing),
          };
        }

        const result = await runMissingTranslationBatch(db, translate, {
          after,
          limit: clampMissingTranslationBatchSize(request.limit),
          version: TRANSLATION_VERSION,
        });
        const summary = {
          target,
          version: TRANSLATION_VERSION,
          scanned: result.scanned,
          items: result.items,
          translated: result.translated,
          copied: result.copied,
          failed: result.failed,
          skipped: result.skipped,
          next_cursor: result.nextCursor,
          errors: result.errors.slice(0, 10),
        };
        await log.usage({
          action: 'translation_backfill',
          status: result.errors.length > 0 ? 'partial' : 'ok',
          usages: result.usages,
          tokensCharged: 0,
          durationMs: Date.now() - started,
          metadata: { ...summary, after },
        });
        return summary;
      }

      const db = supabaseTranslationDb(admin);
      if (request.dryRun) {
        const byLanguage = await db.countStale();
        const stale = Object.values(byLanguage).reduce((sum, n) => sum + n, 0);
        return {
          dry_run: true,
          version: TRANSLATION_VERSION,
          stale,
          by_language: byLanguage,
          estimated_cost_usd: estimate(stale),
        };
      }

      const result = await runTranslationBackfillBatch(db, translate, {
        after: request.after,
        limit: clampTranslationBatchSize(request.limit),
        version: TRANSLATION_VERSION,
        isLanguage: isTranslateLanguageCode,
      });

      const nextCursor = result.nextCursor
        ? { recipe_id: result.nextCursor.recipeId, language_code: result.nextCursor.languageCode }
        : null;
      await log.usage({
        action: 'translation_backfill',
        status: result.errors.length > 0 ? 'partial' : 'ok',
        usages: result.usages,
        tokensCharged: 0,
        durationMs: Date.now() - started,
        metadata: {
          version: TRANSLATION_VERSION,
          scanned: result.scanned,
          updated: result.updated,
          failed: result.failed,
          skipped: result.skipped,
          next_cursor: nextCursor,
          errors: result.errors.slice(0, 10),
        },
      });

      return {
        version: TRANSLATION_VERSION,
        scanned: result.scanned,
        updated: result.updated,
        failed: result.failed,
        skipped: result.skipped,
        next_cursor: nextCursor,
        errors: result.errors.slice(0, 10),
      };
    } catch (error) {
      console.error('[backfill-translations] batch failed', error);
      throw HttpError.legacy(500, 'Backfill batch failed');
    }
  },
);

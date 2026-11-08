import {
  buildRecipeBackup,
  planRecipeRestore,
  type ParsedRecipeBackup,
  type RecipeBackup,
} from '@/lib/recipeBackup';
import { recipeUrlOrigin } from '@/lib/recipeOrigin';
import { supabase } from '@/lib/supabase/client';
import { fetchRecipeByUrl, fetchRecipesPage } from '@/lib/supabase/recipes';
import type { Recipe, RecipeTranslationContent } from '@/types/recipe';

/** PostgREST caps a response at 1000 rows, so whole-library reads page through. */
const PAGE_SIZE = 1000;
const TRANSLATION_CHUNK = 200;

export type RecipeRestoreResult = {
  added: number;
  /** Already in the library, so left alone. */
  skipped: number;
  /** Entries in the file that were not usable recipes. */
  invalid: number;
  collectionsCreated: number;
};

/** Every saved recipe with its tags, translations and collections. */
export async function fetchRecipeBackup(): Promise<RecipeBackup> {
  const [recipes, collections, translations] = await Promise.all([
    fetchAllRecipes(),
    fetchAllCollections(),
    fetchAllTranslations(),
  ]);
  return buildRecipeBackup({ recipes, collections, translations });
}

/**
 * Adds the backup's recipes that aren't in the library yet, then rebuilds its collections. Inserts
 * go straight to the table, so a restore never spends credits. Safe to re-run after a failure:
 * anything restored the first time is matched and skipped.
 */
export async function restoreRecipeBackup(backup: ParsedRecipeBackup): Promise<RecipeRestoreResult> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Must be signed in to restore recipes.');
  const userId = userData.user.id;

  const library = await fetchAllRecipes();
  const { toAdd, existingIds, repeats } = planRecipeRestore(backup.recipes, library);
  const idMap: Record<string, string> = { ...existingIds };
  const translationRows: Record<string, unknown>[] = [];
  let added = 0;

  for (const recipe of toAdd) {
    const { data, error } = await supabase
      .from('recipes')
      .insert(restoreRow(recipe, userId))
      .select('id')
      .single();

    if (error) {
      // Saved by the same URL since the library was read, or matched by the server's wider rules.
      if (error.code === '23505' && recipe.original_url) {
        const existing = await fetchRecipeByUrl(
          recipe.original_url,
          recipeUrlOrigin(recipe.extraction_source),
        );
        if (existing) idMap[recipe.id] = existing.id;
        continue;
      }
      throw error;
    }

    const newId = (data as { id: string }).id;
    idMap[recipe.id] = newId;
    added += 1;
    for (const [language_code, content] of Object.entries(recipe.translations ?? {})) {
      translationRows.push({
        recipe_id: newId,
        language_code,
        title: content.title,
        ingredients: content.ingredients,
        instructions: content.instructions,
      });
    }
  }

  for (const [repeatId, firstId] of Object.entries(repeats)) {
    if (idMap[firstId]) idMap[repeatId] = idMap[firstId];
  }

  await restoreTranslations(translationRows);
  const collectionsCreated = await restoreCollections(userId, backup.collections, idMap);

  return {
    added,
    skipped: backup.recipes.length - added,
    invalid: backup.invalid,
    collectionsCreated,
  };
}

function restoreRow(recipe: Recipe, userId: string): Record<string, unknown> {
  const {
    id: _id,
    user_id: _userId,
    translations: _translations,
    display_title: _displayTitle,
    migrated_from_guest: _migrated,
    // A restored recipe starts with nothing recalculating (ADR 018), whatever the file says.
    recalc_pending: _recalcPending,
    recalc_started_at: _recalcStartedAt,
    ...persistable
  } = recipe;
  return {
    ...persistable,
    is_favorite: recipe.is_favorite === true,
    source_language: recipe.source_language ?? 'en',
    user_id: userId,
  };
}

async function restoreTranslations(rows: Record<string, unknown>[]): Promise<void> {
  for (let i = 0; i < rows.length; i += TRANSLATION_CHUNK) {
    const { error } = await supabase
      .from('recipe_translations')
      .upsert(rows.slice(i, i + TRANSLATION_CHUNK), { onConflict: 'recipe_id,language_code' });
    // Best-effort: translations can be made again, the recipes are what matter.
    if (error) {
      console.warn('Could not restore recipe translations', error.message);
      return;
    }
  }
}

async function restoreCollections(
  userId: string,
  collections: ParsedRecipeBackup['collections'],
  idMap: Record<string, string>,
): Promise<number> {
  if (collections.length === 0) return 0;

  const { data: existingRows, error: existingError } = await supabase
    .from('collections')
    .select('id, name')
    .eq('user_id', userId);
  if (existingError) throw existingError;

  // The unique index compares lower(trim(name)), so match the same way.
  const byName = new Map<string, string>();
  for (const row of (existingRows as { id: string; name: string }[] | null) ?? []) {
    byName.set(normalizeCollectionName(row.name), row.id);
  }

  let created = 0;
  for (const collection of collections) {
    const key = normalizeCollectionName(collection.name);
    let collectionId = byName.get(key);
    if (!collectionId) {
      const { data, error } = await supabase
        .from('collections')
        .insert({ user_id: userId, name: collection.name })
        .select('id')
        .single();
      if (error) throw error;
      collectionId = (data as { id: string }).id;
      byName.set(key, collectionId);
      created += 1;
    }

    const recipeIds = [
      ...new Set(collection.recipe_ids.map((id) => idMap[id]).filter((id): id is string => Boolean(id))),
    ];
    if (recipeIds.length === 0) continue;
    const { error: membershipError } = await supabase
      .from('collection_recipes')
      .upsert(
        recipeIds.map((recipe_id) => ({ collection_id: collectionId, recipe_id })),
        { onConflict: 'collection_id,recipe_id', ignoreDuplicates: true },
      );
    if (membershipError) throw membershipError;
  }

  return created;
}

async function fetchAllRecipes(): Promise<Recipe[]> {
  const recipes: Recipe[] = [];
  for (;;) {
    const page = await fetchRecipesPage(recipes.length, PAGE_SIZE);
    recipes.push(...page.recipes);
    if (page.recipes.length < PAGE_SIZE || recipes.length >= page.total) return recipes;
  }
}

async function fetchAllCollections(): Promise<{ name: string; recipeIds: string[] }[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, name')
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = (data as { id: string; name: string }[] | null) ?? [];
  if (rows.length === 0) return [];

  const memberships = await selectAll<{ collection_id: string; recipe_id: string }>(
    'collection_recipes',
    'collection_id, recipe_id',
    ['collection_id', 'recipe_id'],
  );
  const byCollection = new Map<string, string[]>();
  for (const row of memberships) {
    const list = byCollection.get(row.collection_id) ?? [];
    list.push(row.recipe_id);
    byCollection.set(row.collection_id, list);
  }
  return rows.map((row) => ({ name: row.name, recipeIds: byCollection.get(row.id) ?? [] }));
}

async function fetchAllTranslations(): Promise<Record<string, Record<string, RecipeTranslationContent>>> {
  type Row = RecipeTranslationContent & { recipe_id: string; language_code: string };
  let rows: Row[];
  try {
    rows = await selectAll<Row>(
      'recipe_translations',
      'recipe_id, language_code, title, ingredients, instructions',
      ['recipe_id', 'language_code'],
    );
  } catch (err) {
    // Older databases without the table still get a backup of the recipes themselves.
    if ((err as { code?: string }).code === 'PGRST205') return {};
    throw err;
  }

  const byRecipe: Record<string, Record<string, RecipeTranslationContent>> = {};
  for (const row of rows) {
    byRecipe[row.recipe_id] = {
      ...(byRecipe[row.recipe_id] ?? {}),
      [row.language_code]: {
        title: row.title,
        ingredients: row.ingredients,
        instructions: row.instructions,
      },
    };
  }
  return byRecipe;
}

async function selectAll<T>(table: string, columns: string, orderBy: string[]): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    let query = supabase.from(table).select(columns);
    for (const column of orderBy) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data as T[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function normalizeCollectionName(name: string): string {
  return name.trim().toLowerCase();
}

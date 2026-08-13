import {
  clearGuestMigrationJournal,
  prepareGuestRecipeIdMap,
  updateGuestRecipeIdMapping,
} from '@/lib/guestMigrationJournal';
import { clearGuestRecipes, getGuestRecipes } from '@/lib/guestRecipes';
import { supabase } from '@/lib/supabase/client';
import type { RecipeTranslationContent } from '@/types/recipe';

export type GuestRecipeMigrationResult = {
  migrated: number;
  /** Maps guest recipe id → new Supabase recipe id. */
  idMap: Record<string, string>;
};

/**
 * ADR 002 — after sign-up, move the user's local guest recipes into their
 * Supabase library. Guest recipes and the durable id map remain local until
 * collections and shopping-list provenance have migrated successfully.
 */
export async function migrateGuestRecipesToSupabase(
  userId: string,
): Promise<GuestRecipeMigrationResult> {
  const guestRecipes = await getGuestRecipes();
  const idMap = await prepareGuestRecipeIdMap(
    userId,
    guestRecipes.map((recipe) => recipe.id),
  );
  if (guestRecipes.length === 0) return { migrated: 0, idMap };

  let migrated = 0;

  for (const recipe of guestRecipes) {
    const cloudId = idMap[recipe.id];
    const row = {
      id: cloudId,
      user_id: userId,
      title: recipe.title,
      original_url: recipe.original_url,
      platform: recipe.platform,
      image_url: recipe.image_url,
      source_video_url: recipe.source_video_url,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      servings: recipe.servings,
      calories: recipe.calories,
      estimated_time_minutes: recipe.estimated_time_minutes,
      cost_estimate: recipe.cost_estimate,
      effort_level: recipe.effort_level,
      extraction_status: recipe.extraction_status,
      extraction_source: recipe.extraction_source,
      calories_reasoning: recipe.calories_reasoning,
      time_reasoning: recipe.time_reasoning,
      tags: recipe.tags,
      missing_fields: recipe.missing_fields,
      is_favorite: recipe.is_favorite === true,
      migrated_from_guest: true,
      source_language: recipe.source_language ?? 'en',
    };

    const { data, error } = await supabase.from('recipes').insert(row).select('id').single();
    if (error) {
      if (error.code === '23505') {
        const { data: mappedRecipe, error: mappedError } = await supabase
          .from('recipes')
          .select('id')
          .eq('user_id', userId)
          .eq('id', cloudId)
          .maybeSingle();
        if (mappedError) throw mappedError;
        if (mappedRecipe?.id) {
          await migrateGuestTranslations(cloudId, recipe.translations);
          continue;
        }

        // A recipe saved separately with the same URL wins; journal the
        // existing id so dependent memberships and provenance remain intact.
        if (recipe.original_url) {
          const { data: existing, error: existingError } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', userId)
            .eq('original_url', recipe.original_url)
            .maybeSingle();
          if (existingError) throw existingError;
          if (existing?.id) {
            const existingId = existing.id as string;
            idMap[recipe.id] = existingId;
            await updateGuestRecipeIdMapping(userId, recipe.id, existingId);
            await migrateGuestTranslations(existingId, recipe.translations);
            continue;
          }
        }
      }
      throw error;
    }

    const newId = (data as { id: string }).id;
    if (newId !== cloudId) {
      idMap[recipe.id] = newId;
      await updateGuestRecipeIdMapping(userId, recipe.id, newId);
    }
    await migrateGuestTranslations(idMap[recipe.id], recipe.translations);
    migrated += 1;
  }

  return { migrated, idMap };
}

/** Clear source recipes last, after every id-map consumer has completed. */
export async function finalizeGuestRecipeMigration(userId: string): Promise<void> {
  await clearGuestRecipes();
  await clearGuestMigrationJournal(userId);
}

async function migrateGuestTranslations(
  recipeId: string,
  translations: Record<string, RecipeTranslationContent> | undefined,
): Promise<void> {
  if (!translations) return;
  const rows = Object.entries(translations).map(([language_code, content]) => ({
    recipe_id: recipeId,
    language_code,
    title: content.title,
    ingredients: content.ingredients,
    instructions: content.instructions,
  }));
  if (rows.length === 0) return;
  const { error } = await supabase.from('recipe_translations').upsert(rows, {
    onConflict: 'recipe_id,language_code',
  });
  // Best-effort: recipes already migrated even if translation table is missing.
  if (error && error.code !== 'PGRST205') {
    console.warn('Could not migrate guest recipe translations', error.message);
  }
}

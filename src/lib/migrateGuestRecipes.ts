import { clearGuestRecipes, getGuestRecipes, replaceGuestRecipes } from '@/lib/guestRecipes';
import { supabase } from '@/lib/supabase/client';
import type { Recipe } from '@/types/recipe';

export type GuestRecipeMigrationResult = {
  migrated: number;
  /** Maps guest recipe id → new Supabase recipe id. */
  idMap: Record<string, string>;
};

/**
 * ADR 002 — after sign-up, move the user's local guest recipes into their
 * Supabase library, then clear the local store. Best-effort: if the insert
 * fails we keep the local copies so nothing is lost.
 */
export async function migrateGuestRecipesToSupabase(
  userId: string,
): Promise<GuestRecipeMigrationResult> {
  const guestRecipes = await getGuestRecipes();
  if (guestRecipes.length === 0) return { migrated: 0, idMap: {} };

  const idMap: Record<string, string> = {};
  const unmapped: Recipe[] = [];
  let migrated = 0;

  for (const recipe of guestRecipes) {
    const row = {
      user_id: userId,
      title: recipe.title,
      original_url: recipe.original_url,
      platform: recipe.platform,
      image_url: recipe.image_url,
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
    };

    const { data, error } = await supabase.from('recipes').insert(row).select('id').single();
    if (error) {
      // Unique URL constraint — already in library from a prior partial migration.
      if (error.code === '23505') {
        if (recipe.original_url) {
          const { data: existing } = await supabase
            .from('recipes')
            .select('id')
            .eq('user_id', userId)
            .eq('original_url', recipe.original_url)
            .maybeSingle();
          if (existing?.id) {
            idMap[recipe.id] = existing.id as string;
            continue;
          }
        }
        // Duplicate without a resolvable URL match — keep the local copy.
        unmapped.push(recipe);
        continue;
      }
      throw error;
    }

    idMap[recipe.id] = (data as { id: string }).id;
    migrated += 1;
  }

  if (unmapped.length === 0) {
    await clearGuestRecipes();
  } else {
    await replaceGuestRecipes(unmapped);
  }
  return { migrated, idMap };
}

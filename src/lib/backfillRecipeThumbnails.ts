import { replaceGuestRecipes } from '@/lib/guestRecipes';
import { supabase } from '@/lib/supabase/client';
import { extractYouTubeId, needsThumbnailBackfill } from '@/lib/youtube';
import { Recipe } from '@/types/recipe';

interface BackfillResult {
  updated: { id: string; image_url: string }[];
  thumbnails: Record<string, string>;
}

/** Video ids already attempted this app session — avoids repeat edge calls on every focus. */
const sessionAttemptedVideoIds = new Set<string>();

/** Clears the session backfill cache (mainly for tests). */
export function resetBackfillSession(): void {
  sessionAttemptedVideoIds.clear();
}

/**
 * Upgrades saved recipe thumbnails from legacy hqdefault/sddefault URLs to the
 * best available YouTube thumbnail (Data API when configured, otherwise mqdefault).
 */
export async function backfillRecipeThumbnails(recipes: Recipe[]): Promise<Recipe[]> {
  const candidates = recipes.filter(
    (recipe) =>
      recipe.platform === 'youtube' &&
      recipe.original_url &&
      needsThumbnailBackfill(recipe.image_url),
  );

  if (candidates.length === 0) return recipes;

  const pending = candidates.filter((recipe) => {
    const videoId = extractYouTubeId(recipe.original_url!);
    return videoId && !sessionAttemptedVideoIds.has(videoId);
  });

  if (pending.length === 0) return recipes;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const videoIds = [
    ...new Set(
      pending
        .map((recipe) => extractYouTubeId(recipe.original_url!))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  for (const id of videoIds) {
    sessionAttemptedVideoIds.add(id);
  }

  const recipeIds = pending.map((recipe) => recipe.id);

  const { data, error } = await supabase.functions.invoke<BackfillResult>('backfill-thumbnails', {
    body: { videoIds, recipeIds },
  });

  if (error || !data) return recipes;

  const imageByRecipeId = new Map<string, string>();
  for (const row of data.updated ?? []) {
    imageByRecipeId.set(row.id, row.image_url);
  }

  let changed = false;
  const next = recipes.map((recipe) => {
    const fromDb = imageByRecipeId.get(recipe.id);
    if (fromDb && fromDb !== recipe.image_url) {
      changed = true;
      return { ...recipe, image_url: fromDb };
    }

    const videoId = recipe.original_url ? extractYouTubeId(recipe.original_url) : null;
    const fromResolve = videoId ? data.thumbnails?.[videoId] : undefined;
    if (fromResolve && fromResolve !== recipe.image_url) {
      changed = true;
      return { ...recipe, image_url: fromResolve };
    }

    return recipe;
  });

  if (!session && changed) {
    await replaceGuestRecipes(next);
  }

  return next;
}

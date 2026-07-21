import {
  clearGuestCollections,
  getGuestCollections,
} from '@/lib/guestCollections';
import { supabase } from '@/lib/supabase/client';

/**
 * After guest recipes migrate, recreate guest collections in Supabase using
 * the guest→cloud recipe id map. Dangling memberships are dropped.
 */
export async function migrateGuestCollectionsToSupabase(
  userId: string,
  recipeIdMap: Record<string, string>,
): Promise<number> {
  const guestCollections = await getGuestCollections();
  if (guestCollections.length === 0) return 0;

  let migrated = 0;

  for (const collection of guestCollections) {
    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: userId, name: collection.name })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') continue;
      throw error;
    }

    const collectionId = (data as { id: string }).id;
    const recipeIds = collection.recipeIds
      .map((id) => recipeIdMap[id] ?? (id.startsWith('guest-') ? null : id))
      .filter((id): id is string => Boolean(id));

    if (recipeIds.length > 0) {
      const { error: membershipError } = await supabase.from('collection_recipes').insert(
        recipeIds.map((recipe_id) => ({ collection_id: collectionId, recipe_id })),
      );
      if (membershipError) throw membershipError;
    }

    migrated += 1;
  }

  await clearGuestCollections();
  return migrated;
}

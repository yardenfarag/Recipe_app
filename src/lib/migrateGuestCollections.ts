import {
  clearGuestCollections,
  getGuestCollections,
} from '@/lib/guestCollections';
import { supabase } from '@/lib/supabase/client';

type CollectionIdentity = { id: string; name: string };

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
    let collectionId: string | null = null;
    const { data, error } = await supabase
      .from('collections')
      .insert({ user_id: userId, name: collection.name })
      .select('id')
      .single();

    if (error) {
      if (error.code !== '23505') throw error;

      // The unique index compares lower(trim(name)), so an exact-name query
      // cannot reliably resolve case/whitespace variants.
      const { data: existing, error: existingError } = await supabase
        .from('collections')
        .select('id, name')
        .eq('user_id', userId);
      if (existingError) throw existingError;

      const normalizedName = normalizeCollectionName(collection.name);
      collectionId =
        ((existing as CollectionIdentity[] | null) ?? []).find(
          (candidate) => normalizeCollectionName(candidate.name) === normalizedName,
        )?.id ?? null;
      if (!collectionId) {
        throw new Error('Could not resolve an existing collection during guest data sync.');
      }
    } else {
      collectionId = (data as { id: string }).id;
    }

    const recipeIds = [
      ...new Set(
        collection.recipeIds
          .map((id) => recipeIdMap[id] ?? (id.startsWith('guest-') ? null : id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    if (recipeIds.length > 0) {
      const { error: membershipError } = await supabase
        .from('collection_recipes')
        .upsert(
          recipeIds.map((recipe_id) => ({ collection_id: collectionId, recipe_id })),
          { onConflict: 'collection_id,recipe_id', ignoreDuplicates: true },
        );
      if (membershipError) throw membershipError;
    }

    migrated += 1;
  }

  await clearGuestCollections();
  return migrated;
}

function normalizeCollectionName(name: string): string {
  return name.trim().toLowerCase();
}

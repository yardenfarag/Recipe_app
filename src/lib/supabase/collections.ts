import { supabase } from '@/lib/supabase/client';
import type { RecipeCollection } from '@/types/collection';

type CollectionRow = {
  id: string;
  name: string;
  created_at: string;
};

type MembershipRow = {
  collection_id: string;
  recipe_id: string;
};

export async function fetchCollections(): Promise<RecipeCollection[]> {
  const { data: collections, error } = await supabase
    .from('collections')
    .select('id, name, created_at')
    .order('created_at', { ascending: true });

  if (error) throw error;

  const rows = (collections as CollectionRow[] | null) ?? [];
  if (rows.length === 0) return [];

  const { data: memberships, error: membershipError } = await supabase
    .from('collection_recipes')
    .select('collection_id, recipe_id');

  if (membershipError) throw membershipError;

  const byCollection = new Map<string, string[]>();
  for (const row of (memberships as MembershipRow[] | null) ?? []) {
    const list = byCollection.get(row.collection_id) ?? [];
    list.push(row.recipe_id);
    byCollection.set(row.collection_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    recipeIds: byCollection.get(row.id) ?? [],
  }));
}

export async function createCollection(name: string): Promise<RecipeCollection> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Collection name is required.');

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) throw new Error('Must be signed in.');

  const { data, error } = await supabase
    .from('collections')
    .insert({ user_id: userData.user.id, name: trimmed })
    .select('id, name, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('You already have a collection with that name.');
    }
    throw error;
  }

  const row = data as CollectionRow;
  return { id: row.id, name: row.name, created_at: row.created_at, recipeIds: [] };
}

export async function renameCollection(id: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Collection name is required.');

  const { error } = await supabase.from('collections').update({ name: trimmed }).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      throw new Error('You already have a collection with that name.');
    }
    throw error;
  }
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from('collections').delete().eq('id', id);
  if (error) throw error;
}

export async function setRecipeCollectionMembership(
  recipeId: string,
  collectionIds: string[],
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from('collection_recipes')
    .select('collection_id')
    .eq('recipe_id', recipeId);

  if (existingError) throw existingError;

  const current = new Set(
    ((existing as { collection_id: string }[] | null) ?? []).map((row) => row.collection_id),
  );
  const next = new Set(collectionIds);

  const toAdd = [...next].filter((id) => !current.has(id));
  const toRemove = [...current].filter((id) => !next.has(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('collection_recipes')
      .delete()
      .eq('recipe_id', recipeId)
      .in('collection_id', toRemove);
    if (error) throw error;
  }

  if (toAdd.length > 0) {
    const { error } = await supabase.from('collection_recipes').insert(
      toAdd.map((collection_id) => ({ collection_id, recipe_id: recipeId })),
    );
    if (error) throw error;
  }
}

export async function addRecipeToCollection(
  collectionId: string,
  recipeId: string,
): Promise<void> {
  const { error } = await supabase
    .from('collection_recipes')
    .upsert({ collection_id: collectionId, recipe_id: recipeId }, { onConflict: 'collection_id,recipe_id' });
  if (error) throw error;
}

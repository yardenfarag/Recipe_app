import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import {
  getGuestCollections,
  setGuestCollections,
} from '@/lib/guestCollections';
import {
  addRecipeToCollection as addRecipeToCollectionRemote,
  createCollection as createCollectionRemote,
  deleteCollection as deleteCollectionRemote,
  fetchCollections,
  renameCollection as renameCollectionRemote,
  setRecipeCollectionMembership,
} from '@/lib/supabase/collections';
import type { RecipeCollection } from '@/types/collection';

function createGuestId(): string {
  return `guest-col-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function useCollections() {
  const { user, migrationStatus } = useAuth();
  const [collections, setCollections] = useState<RecipeCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const data = user ? await fetchCollections() : await getGuestCollections();
      setCollections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load collections.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  const createCollection = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Collection name is required.');

      if (user) {
        const created = await createCollectionRemote(trimmed);
        setCollections((prev) => [...prev, created]);
        return created;
      }

      const duplicate = collections.some(
        (c) => c.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (duplicate) throw new Error('You already have a collection with that name.');

      const created: RecipeCollection = {
        id: createGuestId(),
        name: trimmed,
        recipeIds: [],
        created_at: new Date().toISOString(),
      };
      const next = [...collections, created];
      await setGuestCollections(next);
      setCollections(next);
      return created;
    },
    [collections, user],
  );

  const renameCollection = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error('Collection name is required.');

      if (user) {
        await renameCollectionRemote(id, trimmed);
      }

      const next = collections.map((c) => (c.id === id ? { ...c, name: trimmed } : c));
      if (!user) await setGuestCollections(next);
      setCollections(next);
    },
    [collections, user],
  );

  const deleteCollection = useCallback(
    async (id: string) => {
      if (user) {
        await deleteCollectionRemote(id);
      }
      const next = collections.filter((c) => c.id !== id);
      if (!user) await setGuestCollections(next);
      setCollections(next);
    },
    [collections, user],
  );

  const setMembershipsForRecipe = useCallback(
    async (recipeId: string, collectionIds: string[]) => {
      const idSet = new Set(collectionIds);

      if (user) {
        await setRecipeCollectionMembership(recipeId, collectionIds);
        const next = collections.map((c) => {
          const has = idSet.has(c.id);
          const without = c.recipeIds.filter((rid) => rid !== recipeId);
          return {
            ...c,
            recipeIds: has ? [...without, recipeId] : without,
          };
        });
        setCollections(next);
        return;
      }

      const next = collections.map((c) => {
        const has = idSet.has(c.id);
        const without = c.recipeIds.filter((rid) => rid !== recipeId);
        return {
          ...c,
          recipeIds: has ? [...without, recipeId] : without,
        };
      });
      await setGuestCollections(next);
      setCollections(next);
    },
    [collections, user],
  );

  const addRecipeToCollection = useCallback(
    async (collectionId: string, recipeId: string) => {
      if (user) {
        await addRecipeToCollectionRemote(collectionId, recipeId);
      }

      const next = collections.map((c) => {
        if (c.id !== collectionId) return c;
        if (c.recipeIds.includes(recipeId)) return c;
        return { ...c, recipeIds: [...c.recipeIds, recipeId] };
      });
      if (!user) await setGuestCollections(next);
      setCollections(next);
    },
    [collections, user],
  );

  const collectionsForRecipe = useCallback(
    (recipeId: string) => collections.filter((c) => c.recipeIds.includes(recipeId)),
    [collections],
  );

  useFocusEffect(
    useCallback(() => {
      if (user && migrationStatus === 'running') {
        setLoading(true);
        return;
      }
      void refresh();
    }, [refresh, user, migrationStatus]),
  );

  useEffect(() => {
    if (!user) return;
    if (migrationStatus === 'done' || migrationStatus === 'error') {
      void refresh();
    }
  }, [user, migrationStatus, refresh]);

  return {
    collections,
    loading,
    error,
    refresh,
    createCollection,
    renameCollection,
    deleteCollection,
    setMembershipsForRecipe,
    addRecipeToCollection,
    collectionsForRecipe,
  };
}

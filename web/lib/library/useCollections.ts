"use client";

import { useCallback, useEffect, useState } from "react";

import {
  createCollection as createRemote,
  deleteCollection as deleteRemote,
  fetchCollections,
  renameCollection as renameRemote,
  setRecipeCollectionMembership,
} from "@shared/lib/supabase/collections";
import type { RecipeCollection } from "@shared/types/collection";

import { useAuth } from "@/components/AuthProvider";
import { readCollections, writeCollections } from "@/lib/library/libraryCache";

/**
 * The signed-in person's collections, each with the ids of the recipes in it. Changes show at once. Coming back
 * shows the ones from last time while they refresh (lib/library/libraryCache.ts).
 */
export function useCollections() {
  const { user } = useAuth();
  const userId = user?.id;
  const [remembered] = useState(() => (userId ? readCollections(userId) : null));
  const [collections, setCollections] = useState<RecipeCollection[]>(() => remembered ?? []);
  const [loading, setLoading] = useState(!remembered);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setError(null);
    try {
      setCollections(await fetchCollections());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "load failed");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (userId && !loading) writeCollections(userId, collections);
  }, [userId, loading, collections]);

  const createCollection = useCallback(async (name: string) => {
    const created = await createRemote(name.trim());
    setCollections((previous) => [...previous, created]);
    return created;
  }, []);

  const renameCollection = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim();
    await renameRemote(id, trimmed);
    setCollections((previous) => previous.map((c) => (c.id === id ? { ...c, name: trimmed } : c)));
  }, []);

  const deleteCollection = useCallback(async (id: string) => {
    await deleteRemote(id);
    setCollections((previous) => previous.filter((c) => c.id !== id));
  }, []);

  /** Puts a recipe in exactly these collections. */
  const setMembershipsForRecipe = useCallback(async (recipeId: string, collectionIds: string[]) => {
    await setRecipeCollectionMembership(recipeId, collectionIds);
    const wanted = new Set(collectionIds);
    setCollections((previous) =>
      previous.map((c) => {
        const without = c.recipeIds.filter((id) => id !== recipeId);
        return { ...c, recipeIds: wanted.has(c.id) ? [...without, recipeId] : without };
      }),
    );
  }, []);

  return { collections, loading, error, refresh, createCollection, renameCollection, deleteCollection, setMembershipsForRecipe };
}

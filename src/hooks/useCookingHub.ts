import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';

import { fetchHubCards, type HubSort } from '@/lib/supabase/cookingHub';
import { collectLibraryTags } from '@/lib/recipeTags';
import type { RecipeCard } from '@/types/recipeCard';

const PAGE_SIZE = 40;

export function useCookingHub() {
  const [cards, setCards] = useState<RecipeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<HubSort>('popular');

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const load = useCallback(
    async (offset = 0) => {
      const appending = offset > 0;
      if (appending) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await fetchHubCards({
          search: debouncedSearch,
          tags: selectedTags,
          sort,
          offset,
          limit: PAGE_SIZE,
        });
        setCards((prev) => (appending ? [...prev, ...result.cards] : result.cards));
        setHasMore(result.hasMore);
        setTotal(result.total);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load the Cooking Hub.');
        if (!appending) {
          setCards([]);
          setTotal(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedSearch, selectedTags, sort],
  );

  useFocusEffect(
    useCallback(() => {
      void load(0);
    }, [load]),
  );

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void load(cards.length);
  }, [cards.length, hasMore, load, loading, loadingMore]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  }, []);

  const availableTags = collectLibraryTags(cards, 12);

  return {
    cards,
    loading,
    loadingMore,
    error,
    hasMore,
    total,
    search,
    setSearch,
    selectedTags,
    toggleTag,
    clearTags: () => setSelectedTags([]),
    sort,
    setSort,
    availableTags,
    refresh: () => load(0),
    loadMore,
  };
}

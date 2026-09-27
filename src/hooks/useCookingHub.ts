import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchHubCards,
  fetchHubTags,
  type HubSort,
} from '@/lib/supabase/cookingHub';
import type { HubPlatform, RecipeCard } from '@/types/recipeCard';

const PAGE_SIZE = 40;
const REFRESH_PAGE_CAP = PAGE_SIZE * 3;

type LoadMode = 'replace' | 'append' | 'refresh' | 'pull';

type HubFilters = {
  search: string;
  tags: string[];
  sort: HubSort;
  platform: HubPlatform | 'all';
};

function dedupeAppend(current: RecipeCard[], page: RecipeCard[]): RecipeCard[] {
  const seen = new Set(current.map((card) => card.id));
  const next = [...current];
  for (const card of page) {
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    next.push(card);
  }
  return next;
}

export function useCookingHub() {
  const [cards, setCards] = useState<RecipeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [listEpoch, setListEpoch] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sort, setSort] = useState<HubSort>('popular');
  const [platform, setPlatform] = useState<HubPlatform | 'all'>('all');
  const [tagChoices, setTagChoices] = useState<string[]>([]);

  const requestRef = useRef(0);
  const appendLock = useRef(false);
  const hasMoreRef = useRef(false);
  const offsetRef = useRef(0);
  const loadedRef = useRef(0);
  const cardsRef = useRef<RecipeCard[]>([]);
  const hasLoadedRef = useRef(false);
  const filtersRef = useRef<HubFilters>({
    search: '',
    tags: [],
    sort: 'popular',
    platform: 'all',
  });

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 250);
    return () => clearTimeout(timeout);
  }, [search]);

  const commitCards = useCallback((next: RecipeCard[]) => {
    cardsRef.current = next;
    loadedRef.current = next.length;
    offsetRef.current = next.length;
    setCards(next);
  }, []);

  const loadTags = useCallback(async (nextPlatform: HubPlatform | 'all') => {
    try {
      const tags = await fetchHubTags(nextPlatform);
      setTagChoices(tags);
    } catch {
      // Keep the chips already on screen if the tag query fails.
    }
  }, []);

  const run = useCallback(
    async (mode: LoadMode) => {
      if (mode === 'append') {
        if (appendLock.current || !hasMoreRef.current) return;
        appendLock.current = true;
        setLoadingMore(true);
      }

      const requestId = ++requestRef.current;
      const filters = filtersRef.current;
      const offset = mode === 'append' ? offsetRef.current : 0;
      const previousHasMore = hasMoreRef.current;
      if (mode !== 'append') hasMoreRef.current = false;
      const limit =
        mode === 'refresh' || mode === 'pull'
          ? Math.min(Math.max(loadedRef.current, PAGE_SIZE), REFRESH_PAGE_CAP)
          : PAGE_SIZE;
      const hadLoaded = hasLoadedRef.current;

      if (mode === 'replace' && hadLoaded) setQuerying(true);
      if (mode === 'pull') setRefreshing(true);
      setError(null);

      try {
        const result = await fetchHubCards({
          search: filters.search,
          tags: filters.tags,
          sort: filters.sort,
          platform: filters.platform,
          offset,
          limit,
          includeCount: mode !== 'append',
        });
        if (requestRef.current !== requestId) return;

        const next =
          mode === 'append' ? dedupeAppend(cardsRef.current, result.cards) : result.cards;
        commitCards(next);
        hasMoreRef.current = result.hasMore;
        setHasMore(result.hasMore);
        if (typeof result.total === 'number') setTotal(result.total);
        if (mode === 'replace' && hadLoaded) setListEpoch((epoch) => epoch + 1);
        hasLoadedRef.current = true;
      } catch (err) {
        if (requestRef.current !== requestId) return;
        setError(err instanceof Error ? err.message : 'Could not load the Cooking Hub.');
        if (mode !== 'append' && loadedRef.current === 0) {
          commitCards([]);
          setTotal(0);
          setHasMore(false);
          hasMoreRef.current = false;
        } else if (mode !== 'append') {
          hasMoreRef.current = previousHasMore;
        }
        hasLoadedRef.current = true;
      } finally {
        if (mode === 'append') appendLock.current = false;
        if (requestRef.current === requestId) {
          setLoading(false);
          setLoadingMore(false);
          setQuerying(false);
          setRefreshing(false);
        }
      }
    },
    [commitCards],
  );

  const tagKey = selectedTags.join('\u0001');

  useEffect(() => {
    filtersRef.current = {
      search: debouncedSearch,
      tags: tagKey ? tagKey.split('\u0001') : [],
      sort,
      platform,
    };
    void run('replace');
  }, [debouncedSearch, tagKey, sort, platform, run]);

  useEffect(() => {
    void loadTags(platform);
  }, [platform, loadTags]);

  useFocusEffect(
    useCallback(() => {
      if (!hasLoadedRef.current) return;
      void run('refresh');
      void loadTags(filtersRef.current.platform);
    }, [loadTags, run]),
  );

  const loadMore = useCallback(() => {
    void run('append');
  }, [run]);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((item) => item !== tag) : [...prev, tag],
    );
  }, []);

  const clearTags = useCallback(() => setSelectedTags([]), []);

  const availableTags = useMemo(() => {
    const extra = selectedTags.filter((tag) => !tagChoices.includes(tag));
    return [...extra, ...tagChoices];
  }, [selectedTags, tagChoices]);

  return {
    cards,
    loading,
    querying,
    refreshing,
    loadingMore,
    error,
    hasMore,
    total,
    listEpoch,
    search,
    setSearch,
    selectedTags,
    toggleTag,
    clearTags,
    sort,
    setSort,
    platform,
    setPlatform,
    availableTags,
    refresh: () => run('replace'),
    pullRefresh: () => run('pull'),
    loadMore,
  };
}
